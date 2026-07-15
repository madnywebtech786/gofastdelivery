import { ObjectId } from 'mongodb'
import { getDb } from './client.js'

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/**
 * Increment a driver's total distance driven and a route's driven distance.
 * Called from stop-complete, stop-failed, and reroute with the metres driven on that leg/slice.
 */
export async function incrementDrivenDistance(driverId, routeId, metres) {
  if (!metres || metres <= 0) return
  const db = await getDb()
  await Promise.all([
    db.collection('users').updateOne(
      { _id: new ObjectId(driverId) },
      { $inc: { 'driverProfile.totalDistanceDrivenMeters': metres }, $set: { updatedAt: new Date() } }
    ),
    db.collection('routes').updateOne(
      { _id: new ObjectId(routeId) },
      { $inc: { drivenDistanceMeters: metres }, $set: { updatedAt: new Date() } }
    ),
  ])
}

/**
 * Returns stats for a driver for the admin detail page:
 *   totalDistanceDrivenMeters — all-time from driverProfile
 *   totalCompletedBookings    — all-time delivered bookings
 *   totalRoutes               — all-time routes assigned
 *   byDay                     — per-day completed bookings for year+month
 *   byMonth                   — per-month completed bookings for year
 *   year, month, daysInMonth
 */
export async function getDriverStats(driverId, { year, month } = {}) {
  const db          = await getDb()
  const now         = new Date()
  const targetYear  = year  ?? now.getFullYear()
  const targetMonth = month ?? now.getMonth() + 1
  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate()

  const objId = new ObjectId(driverId)

  // Driver doc for distance
  const driver = await db.collection('users').findOne(
    { _id: objId },
    { projection: { 'driverProfile.totalDistanceDrivenMeters': 1 } }
  )

  // All-time completed bookings for this driver
  const totalCompletedBookings = await db.collection('bookings').countDocuments({
    assignedDriverId: objId,
    status: 'delivered',
  })

  // All-time routes
  const totalRoutes = await db.collection('routes').countDocuments({ driverId: objId })

  // Per-day completed bookings for selected month+year
  const monthStart = new Date(`${targetYear}-${String(targetMonth).padStart(2,'0')}-01`)
  const monthEnd   = targetMonth === 12
    ? new Date(`${targetYear + 1}-01-01`)
    : new Date(`${targetYear}-${String(targetMonth + 1).padStart(2,'0')}-01`)

  const byDay = await db.collection('bookings').aggregate([
    {
      $match: {
        assignedDriverId: objId,
        status: 'delivered',
        updatedAt: { $gte: monthStart, $lt: monthEnd },
      },
    },
    {
      $group: {
        _id:   { $dayOfMonth: '$updatedAt' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray()

  // Per-month completed bookings for selected year
  const yearStart = new Date(`${targetYear}-01-01`)
  const yearEnd   = new Date(`${targetYear + 1}-01-01`)

  const byMonth = await db.collection('bookings').aggregate([
    {
      $match: {
        assignedDriverId: objId,
        status: 'delivered',
        updatedAt: { $gte: yearStart, $lt: yearEnd },
      },
    },
    {
      $group: {
        _id:   { $month: '$updatedAt' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray()

  return {
    totalDistanceDrivenMeters: driver?.driverProfile?.totalDistanceDrivenMeters ?? 0,
    totalCompletedBookings,
    totalRoutes,
    byDay,
    byMonth,
    year:        targetYear,
    month:       targetMonth,
    daysInMonth,
    monthLabel:  MONTHS_SHORT[targetMonth - 1],
  }
}

/**
 * List all drivers with their on-duty status.
 * Excludes passwordHash.
 */
export async function findAllDrivers() {
  const db = await getDb()
  return db
    .collection('users')
    .find({ role: 'driver', isActive: true }, { projection: { passwordHash: 0 } })
    .sort({ name: 1 })
    .toArray()
}

/**
 * Find a single driver by ID.
 */
export async function findDriverById(driverId) {
  const db = await getDb()
  return db
    .collection('users')
    .findOne(
      { _id: new ObjectId(driverId), role: 'driver' },
      { projection: { passwordHash: 0 } }
    )
}

/**
 * Save or update the active route for a driver.
 * Deactivates any existing active routes for this driver first.
 */
export async function upsertDriverRoute(driverId, routeData) {
  const db = await getDb()

  // Deactivate old active route
  await db
    .collection('routes')
    .updateMany(
      { driverId: new ObjectId(driverId), isActive: true },
      { $set: { isActive: false } }
    )

  const now = new Date()
  const doc = {
    driverId: new ObjectId(driverId),
    ...routeData,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }
  const result = await db.collection('routes').insertOne(doc)
  return { ...doc, _id: result.insertedId }
}

/**
 * Get the current active route for a driver.
 */
export async function findActiveRoute(driverId) {
  const db = await getDb()
  return db
    .collection('routes')
    .findOne({ driverId: new ObjectId(driverId), isActive: true })
}

/**
 * Bulk variant: one query for many drivers. Returns Map<driverIdString, routeDoc>.
 * Used by the admin drivers list to avoid N+1.
 */
export async function findActiveRoutesByDriverIds(driverIds) {
  if (!driverIds?.length) return new Map()
  const db = await getDb()
  const objIds = driverIds.map((id) => new ObjectId(id))
  const routes = await db
    .collection('routes')
    .find({ driverId: { $in: objIds }, isActive: true })
    .toArray()
  return new Map(routes.map((r) => [String(r.driverId), r]))
}

/**
 * Update an existing route document (called by worker notify endpoint).
 */
export async function updateRoute(routeId, updateData) {
  const db = await getDb()
  return db.collection('routes').updateOne(
    { _id: new ObjectId(routeId) },
    { $set: { ...updateData, updatedAt: new Date() } }
  )
}

/**
 * Merge new bookings' stops into the driver's existing active route.
 * Does NOT deactivate the existing route — updates it in-place.
 *
 * @param {string}     routeId           - The _id of the route doc to update
 * @param {ObjectId[]} bookingObjectIds  - Array of new booking _ids to add to assignmentIds
 * @param {Array}      newOptimizedStops - Full re-optimized optimizedStops array
 * @param {object}     routeResult       - { encodedPolyline, distanceMeters, durationSeconds }
 * @param {string}     routePhase        - 'pickup' | 'dropoff'
 */
export async function mergeIntoActiveRoute(
  routeId,
  bookingObjectIds,
  newOptimizedStops,
  routeResult,
  routePhase,
) {
  const db = await getDb()
  return db.collection('routes').updateOne(
    { _id: new ObjectId(routeId) },
    {
      $addToSet: { assignmentIds: { $each: bookingObjectIds } },
      $set: {
        routePhase,
        optimizedStops:       newOptimizedStops,
        encodedPolyline:      routeResult?.encodedPolyline    ?? null,
        totalDistanceMeters:  routeResult?.distanceMeters     ?? null,
        totalDurationSeconds: routeResult?.durationSeconds    ?? null,
        updatedAt: new Date(),
      },
    }
  )
}
