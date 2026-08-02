import { ObjectId } from 'mongodb'
import { getDb } from './client.js'
import { calgaryStartOfToday, CALGARY_TZ } from './calgaryTime.js'

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const DISTANCE_RANGES = ['day', 'week', 'month', 'year']

/**
 * [start, end) window for a distance-range filter, anchored to the Calgary
 * calendar day/week/month/year containing "now" — never the server's local
 * timezone (see calgaryStartOfToday doc comment).
 * 'week' starts Monday, matching how most drivers think about a work week.
 */
function distanceRangeWindow(range) {
  const todayStart = calgaryStartOfToday()

  if (range === 'day') {
    const end = new Date(todayStart)
    end.setDate(end.getDate() + 1)
    return { start: todayStart, end }
  }

  if (range === 'week') {
    // getDay(): 0=Sun..6=Sat. Convert to a Monday-start offset.
    const dayOfWeek = todayStart.getDay()
    const daysSinceMonday = (dayOfWeek + 6) % 7
    const start = new Date(todayStart)
    start.setDate(start.getDate() - daysSinceMonday)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { start, end }
  }

  if (range === 'year') {
    const year = Number(todayStart.toLocaleDateString('en-CA', { timeZone: CALGARY_TZ, year: 'numeric' }))
    return { start: calgaryStartOfToday(new Date(`${year}-01-01T12:00:00Z`)), end: calgaryStartOfToday(new Date(`${year + 1}-01-01T12:00:00Z`)) }
  }

  // 'month' (default)
  const [year, month] = todayStart.toLocaleDateString('en-CA', { timeZone: CALGARY_TZ }).split('-').map(Number)
  const start = calgaryStartOfToday(new Date(Date.UTC(year, month - 1, 1, 12)))
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
  const end = calgaryStartOfToday(new Date(Date.UTC(nextMonth.y, nextMonth.m - 1, 1, 12)))
  return { start, end }
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Mongo $group _id expression + a fn to build the full ordered bucket list
// (so empty buckets show as 0 instead of being missing from the series),
// per distance-range granularity. All date operators are Calgary-anchored
// via `timezone: CALGARY_TZ` — the same reasoning as calgaryStartOfToday.
function distanceBucketSpec(range, start) {
  if (range === 'day') {
    return {
      groupId: { $hour: { date: '$createdAt', timezone: CALGARY_TZ } },
      buckets: Array.from({ length: 24 }, (_, h) => ({
        id: h,
        label: h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`,
      })),
    }
  }
  if (range === 'week') {
    return {
      groupId: { $dayOfWeek: { date: '$createdAt', timezone: CALGARY_TZ } }, // 1=Sun..7=Sat
      // Reorder Mon..Sun to match distanceRangeWindow's Monday-start week.
      buckets: [1, 2, 3, 4, 5, 6, 0].map((wd) => ({ id: wd + 1, label: WEEKDAY_SHORT[wd] })),
    }
  }
  if (range === 'year') {
    return {
      groupId: { $month: { date: '$createdAt', timezone: CALGARY_TZ } },
      buckets: MONTHS_SHORT.map((label, i) => ({ id: i + 1, label })),
    }
  }
  // 'month' — one bucket per calendar day of the selected month.
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  return {
    groupId: { $dayOfMonth: { date: '$createdAt', timezone: CALGARY_TZ } },
    buckets: Array.from({ length: daysInMonth }, (_, i) => ({ id: i + 1, label: String(i + 1) })),
  }
}

/**
 * Sum of routes.drivenDistanceMeters for routes STARTED (createdAt) within
 * the given Calgary-anchored range for this driver, plus a bucketed series
 * for the Miles chart (hourly for 'day', daily for 'week'/'month', monthly
 * for 'year' — empty buckets included as 0 so the chart has a consistent
 * x-axis). Approximation: a route spanning midnight attributes its whole
 * distance to the day it started on — accurate for the common case (one
 * route = one day's shift; routes stay active only for a single driver
 * shift, see upsertDriverRoute), not exact for a route that happens to run
 * past midnight.
 */
export async function getDriverDistanceForRange(driverId, range = 'month') {
  const safeRange = DISTANCE_RANGES.includes(range) ? range : 'month'
  const db = await getDb()
  const objId = new ObjectId(driverId)
  const { start, end } = distanceRangeWindow(safeRange)
  const { groupId, buckets } = distanceBucketSpec(safeRange, start)

  const rows = await db.collection('routes').aggregate([
    { $match: { driverId: objId, createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: groupId, meters: { $sum: { $ifNull: ['$drivenDistanceMeters', 0] } } } },
  ]).toArray()
  const byId = new Map(rows.map((r) => [r._id, r.meters]))

  const series = buckets.map((b) => ({ label: b.label, meters: byId.get(b.id) ?? 0 }))
  const distanceMeters = series.reduce((sum, s) => sum + s.meters, 0)

  return { range: safeRange, distanceMeters, series }
}

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
 *   distanceRangeMeters       — total distance for the requested distanceRange
 *                               ('day'|'week'|'month'|'year'), Calgary-anchored
 *   distanceRange             — echoes back the resolved range
 *   distanceSeries            — [{label, meters}, ...] bucketed for the Miles
 *                               chart: hourly for 'day', daily for 'week'/
 *                               'month', monthly for 'year'; empty buckets
 *                               included as 0
 *   totalCompletedBookings    — all-time delivered bookings
 *   totalRoutes               — all-time routes assigned
 *   byDay                     — per-day completed bookings for year+month
 *   byMonth                   — per-month completed bookings for year
 *   year, month, daysInMonth
 */
export async function getDriverStats(driverId, { year, month, distanceRange = 'month' } = {}) {
  const db          = await getDb()
  const nowInCalgary = calgaryStartOfToday()
  const [nowYear, nowMonth] = nowInCalgary.toLocaleDateString('en-CA', { timeZone: CALGARY_TZ }).split('-').map(Number)
  const targetYear  = year  ?? nowYear
  const targetMonth = month ?? nowMonth
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

  // Miles-driven stat for the requested range (day/week/month/year, Calgary-anchored)
  const distanceForRange = await getDriverDistanceForRange(driverId, distanceRange)

  // Per-day completed bookings for selected month+year — window boundaries
  // anchored to Calgary midnight, not UTC midnight (see calgaryStartOfToday).
  const monthStart = calgaryStartOfToday(new Date(Date.UTC(targetYear, targetMonth - 1, 1, 12)))
  const nextMonth   = targetMonth === 12 ? { y: targetYear + 1, m: 1 } : { y: targetYear, m: targetMonth + 1 }
  const monthEnd    = calgaryStartOfToday(new Date(Date.UTC(nextMonth.y, nextMonth.m - 1, 1, 12)))

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
        _id:   { $dayOfMonth: { date: '$updatedAt', timezone: CALGARY_TZ } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray()

  // Per-month completed bookings for selected year
  const yearStart = calgaryStartOfToday(new Date(Date.UTC(targetYear, 0, 1, 12)))
  const yearEnd   = calgaryStartOfToday(new Date(Date.UTC(targetYear + 1, 0, 1, 12)))

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
        _id:   { $month: { date: '$updatedAt', timezone: CALGARY_TZ } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray()

  return {
    totalDistanceDrivenMeters: driver?.driverProfile?.totalDistanceDrivenMeters ?? 0,
    distanceRangeMeters: distanceForRange.distanceMeters,
    distanceRange: distanceForRange.range,
    distanceSeries: distanceForRange.series,
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
