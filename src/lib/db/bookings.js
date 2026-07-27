import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import { getDb } from './client.js'

const MAX_PACKAGES = 20

function normalizeOnePackage(p) {
  return {
    itemId:     String(p?.itemId ?? '').trim().slice(0, 60) || nanoid(10),
    kind:       String(p?.kind ?? '').trim().slice(0, 120),
    weightLbs:  Number.isFinite(Number(p?.weightLbs)) && Number(p?.weightLbs) > 0 ? Number(p.weightLbs) : 0,
    quantity:   Number.isFinite(Number(p?.quantity)) && Number(p?.quantity) > 0 ? Math.floor(Number(p.quantity)) : 1,
    pickedUpAt:  null,
    deliveredAt: null,
  }
}

/**
 * Normalizes packageDetails for storage.
 *
 * Accepts either the legacy single-package shape ({kind, weightLbs}) or the
 * multi-package shape ({packages: [{kind, weightLbs, quantity}, ...]}).
 * When `packages` is present, the top-level `kind` is DERIVED (first
 * package's kind, for display back-compat) so every existing reader of
 * packageDetails.kind keeps working unchanged for both shapes. There is no
 * top-level weight anymore — pricing (src/lib/pricing.js) checks each
 * package's weightLbs independently against the overweight threshold.
 */
function normalizePackageDetails(pkg) {
  if (!pkg) return null

  if (Array.isArray(pkg.packages) && pkg.packages.length > 0) {
    const packages = pkg.packages.slice(0, MAX_PACKAGES).map(normalizeOnePackage)
    return {
      kind: packages[0].kind,
      packages,
    }
  }

  return {
    kind:      String(pkg.kind ?? '').trim().slice(0, 120),
    weightLbs: Number.isFinite(Number(pkg.weightLbs)) && Number(pkg.weightLbs) > 0 ? Number(pkg.weightLbs) : 0,
  }
}

export const BOOKING_STATUSES = [
  'pending',           // created by customer, waiting for pickup assignment
  'assigned_pickup',   // admin assigned a driver to pick it up
  'picked_up',         // driver confirmed pickup — ready for delivery assignment
  'assigned_delivery', // admin assigned a driver to deliver it
  'delivered',         // driver confirmed delivery
  'cancelled',
  'failed_pickup',     // driver marked pickup as failed — re-assignable
  'failed_dropoff',    // driver marked drop-off as failed — re-assignable
]

/**
 * Create a new booking.
 */
export async function createBooking({ customerId, stops, trackingToken, senderEmail = null, receiverEmail = null, packageDetails = null, estimatedPrice = null }) {
  const db = await getDb()
  const now = new Date()
  const doc = {
    trackingToken,
    customerId: customerId ? new ObjectId(customerId) : null,
    status: 'pending',
    stops,
    packageDetails:  normalizePackageDetails(packageDetails),
    estimatedPrice:  estimatedPrice  ?? null,
    senderEmail:     senderEmail     || null,
    receiverEmail:   receiverEmail   || null,
    assignedDriverId: null,
    assignedAt: null,
    estimatedDistanceMeters: null,
    estimatedDurationSeconds: null,
    statusHistory: [{ status: 'pending', timestamp: now, note: 'Booking created' }],
    createdAt: now,
    updatedAt: now,
  }
  const result = await db.collection('bookings').insertOne(doc)
  return { ...doc, _id: result.insertedId }
}

/**
 * Find a booking by ID.
 * Pass customerId to enforce ownership (customer role).
 */
export async function findBookingById(id, { customerId, driverId } = {}) {
  const db = await getDb()
  const filter = { _id: new ObjectId(id) }
  if (customerId) filter.customerId = new ObjectId(customerId)
  if (driverId) filter.assignedDriverId = new ObjectId(driverId)
  return db.collection('bookings').findOne(filter)
}

/**
 * Find a booking by its public tracking token (no auth required).
 * Joins driver name+phone for pickup and dropoff so the tracking page can
 * show the correct driver at each stage without exposing internal IDs.
 */
export async function findBookingByToken(trackingToken) {
  const db = await getDb()
  const booking = await db.collection('bookings').findOne(
    { trackingToken },
    {
      projection: {
        customerId: 0,
        assignedDriverId: 0,
        senderEmail: 0,
        receiverEmail: 0,
        estimatedPrice: 0,
      },
    }
  )
  if (!booking) return null

  // Collect unique driver IDs that need to be resolved
  const driverIdSet = new Set()
  if (booking.pickupDriverId)  driverIdSet.add(String(booking.pickupDriverId))
  if (booking.dropoffDriverId) driverIdSet.add(String(booking.dropoffDriverId))

  if (driverIdSet.size > 0) {
    const drivers = await db.collection('users')
      .find(
        { _id: { $in: [...driverIdSet].map((id) => new ObjectId(id)) } },
        { projection: { name: 1, phone: 1 } }
      )
      .toArray()

    const driverMap = new Map(drivers.map((d) => [String(d._id), { name: d.name ?? null, phone: d.phone ?? null }]))

    if (booking.pickupDriverId) {
      booking.pickupDriver = driverMap.get(String(booking.pickupDriverId)) ?? null
    }
    if (booking.dropoffDriverId) {
      booking.dropoffDriver = driverMap.get(String(booking.dropoffDriverId)) ?? null
    }
  }

  // Remove raw ObjectId fields — only expose the resolved name/phone objects
  delete booking.pickupDriverId
  delete booking.dropoffDriverId

  return booking
}

/**
 * List bookings for a specific customer (newest first).
 */
export async function findBookingsByCustomer(customerId, { limit = 20, skip = 0, statusIn = null } = {}) {
  const db = await getDb()
  const query = { customerId: new ObjectId(customerId) }
  if (statusIn?.length) query.status = { $in: statusIn }
  return db
    .collection('bookings')
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray()
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * List all bookings (admin), optionally filtered by status.
 * `status` may be a single status string or an array of statuses.
 * `pickupDate` ('YYYY-MM-DD') restricts to bookings whose pickup stop's
 * pickupTime falls on that calendar day — pickupTime is stored as a raw
 * datetime-local string ("YYYY-MM-DDTHH:mm", not a Date), so this is a
 * string-prefix match, not a Date range query. Only the pickup stop ever has
 * pickupTime, so this can't accidentally match a dropoff stop.
 */
function buildAdminFilter({ status, hasDriver, sinceDate, untilDate, pickupDate, search, excludeHiddenFromHistory }) {
  const filter = Array.isArray(status)
    ? (status.length > 0 ? { status: { $in: status } } : {})
    : (status ? { status } : {})
  if (hasDriver === true)  filter.assignedDriverId = { $ne: null }
  if (hasDriver === false) filter.assignedDriverId = null
  if (sinceDate || untilDate) {
    filter.createdAt = {}
    if (sinceDate) filter.createdAt.$gte = sinceDate
    if (untilDate) filter.createdAt.$lte = untilDate
  }
  if (pickupDate) {
    filter['stops.pickupTime'] = { $regex: '^' + escapeRegex(pickupDate) }
  }
  // Only the admin History page passes this — every other caller (dashboard
  // stats, the main admin bookings list, driver stats, tracking) intentionally
  // keeps reading hidden bookings, since hiding is a History-page-only view
  // concern, not a real deletion (see hideBookingsFromHistory doc comment).
  if (excludeHiddenFromHistory) {
    filter.hiddenFromHistory = { $ne: true }
  }
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i')
    filter.$or = [
      { senderEmail:          re },
      { 'stops.contactName':  re },
      { 'stops.address':      re },
    ]
  }
  return filter
}

// Builds the Mongo filter for either a flat query object or a `{ combine:
// [queryObj, ...] }` shape (used by the "Today's Work" filter, which unions
// several status groups that each need their own independent hasDriver/
// pickupDate scoping — impossible to express as one flat filter since only
// one of the sub-groups (pending) is ever date-restricted). `search` is
// re-applied inside every branch of the $or so it still ANDs correctly
// against each branch's own status/date constraints.
function buildAdminQuery(params) {
  const { combine, ...flat } = params
  if (!Array.isArray(combine)) return buildAdminFilter(flat)
  return { $or: combine.map((sub) => buildAdminFilter({ ...sub, search: flat.search, excludeHiddenFromHistory: flat.excludeHiddenFromHistory })) }
}

export async function findAllBookings({ status, hasDriver, sinceDate, untilDate, pickupDate, search, combine, excludeHiddenFromHistory, limit = 50, skip = 0 } = {}) {
  const db = await getDb()
  return db
    .collection('bookings')
    .find(buildAdminQuery({ status, hasDriver, sinceDate, untilDate, pickupDate, search, combine, excludeHiddenFromHistory }))
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray()
}

export async function countAllBookings({ status, hasDriver, sinceDate, untilDate, pickupDate, search, combine, excludeHiddenFromHistory } = {}) {
  const db = await getDb()
  return db.collection('bookings').countDocuments(
    buildAdminQuery({ status, hasDriver, sinceDate, untilDate, pickupDate, search, combine, excludeHiddenFromHistory })
  )
}

// Sanity ceiling for "select all matching this filter" — a bounded guard
// against an unbounded query, not a real business limit. Mirrors the
// reasoning behind MAX_STOPS_PER_ROUTE in bulk-assign/route.js: this is a
// safety cap on accidental scale, not an expected real-world count.
const SELECT_ALL_MAX_RESULTS = 500

/**
 * Same admin filter as findAllBookings, but returns only the fields the
 * "select all matching this filter" UI action needs (not full documents) and
 * has no pagination — up to SELECT_ALL_MAX_RESULTS matches, sorted the same
 * way findAllBookings/the paginated list is, so "select all" always lines up
 * with what the paginated view would show across all its pages.
 */
export async function findAllBookingsLean({ status, hasDriver, sinceDate, untilDate, pickupDate, search, combine } = {}) {
  const db = await getDb()
  return db
    .collection('bookings')
    .find(
      buildAdminQuery({ status, hasDriver, sinceDate, untilDate, pickupDate, search, combine }),
      { projection: { _id: 1, status: 1, assignedDriverId: 1, stops: 1, trackingToken: 1 } }
    )
    .sort({ createdAt: -1 })
    .limit(SELECT_ALL_MAX_RESULTS)
    .toArray()
}

/**
 * Find multiple bookings by their IDs. Returns only the ones that exist.
 */
export async function findBookingsByIds(ids) {
  const db = await getDb()
  return db
    .collection('bookings')
    .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } })
    .toArray()
}

/**
 * Update booking status and append to status history.
 * Pass clearDriver:true when transitioning to 'picked_up' from a pickup_only
 * assignment — clears assignedDriverId so admin can re-assign for delivery.
 * Do NOT pass clearDriver for pickup_and_dropoff bookings: the dropoff stop
 * is already in the driver's route and must not be re-assigned.
 */
export async function updateBookingStatus(id, status, { note = '', driverId, clearDriver = false } = {}) {
  const db = await getDb()
  const filter = { _id: new ObjectId(id) }
  if (driverId) filter.assignedDriverId = new ObjectId(driverId)

  const setFields = { status, updatedAt: new Date() }
  if (clearDriver) setFields.assignedDriverId = null

  return db.collection('bookings').updateOne(filter, {
    $set: setFields,
    $push: { statusHistory: { status, timestamp: new Date(), note } },
  })
}

/**
 * Stamp a fresh ETA onto one or both of a booking's stops (pickup/dropoff),
 * called from reoptimizeRoute() every time it recomputes route.optimizedStops
 * — this is what lets the public tracking page and customer dashboard show
 * the SAME live ETA the driver's app is using, instead of nothing. Only
 * updates the stop(s) actually passed in — a reroute mid-shift may only
 * affect the dropoff leg (pickup already completed), so pickupEta/dropoffEta
 * are independently optional.
 *
 * Uses positional array filters (same technique as markBookingItems above) so
 * this is a targeted two-field update, not a full booking rewrite.
 */
export async function updateStopEtas(bookingId, { pickupEta, dropoffEta } = {}) {
  if (!pickupEta && !dropoffEta) return { matchedCount: 0, modifiedCount: 0 }
  const db = await getDb()

  const setFields = {}
  const arrayFilters = []
  if (pickupEta) {
    setFields['stops.$[pickup].estimatedArrivalAt'] = pickupEta
    arrayFilters.push({ 'pickup.type': 'pickup' })
  }
  if (dropoffEta) {
    setFields['stops.$[dropoff].estimatedArrivalAt'] = dropoffEta
    arrayFilters.push({ 'dropoff.type': 'dropoff' })
  }

  return db.collection('bookings').updateOne(
    { _id: new ObjectId(bookingId) },
    { $set: setFields },
    { arrayFilters }
  )
}

/**
 * Assign a driver to a booking for either pickup or delivery.
 * newStatus must be 'assigned_pickup' or 'assigned_delivery'.
 * allowedFromStatus is the status the booking must currently be in.
 */
export async function assignDriverToBooking(
  bookingId,
  driverId,
  { estimatedDistanceMeters, estimatedDurationSeconds, newStatus, allowedFromStatus, kind } = {}
) {
  const db = await getDb()
  const now = new Date()
  const status = newStatus ?? 'assigned_pickup'
  const fromStatus = allowedFromStatus ?? 'pending'

  const setFields = {
    assignedDriverId: new ObjectId(driverId),
    assignedAt: now,
    status,
    estimatedDistanceMeters: estimatedDistanceMeters || null,
    estimatedDurationSeconds: estimatedDurationSeconds || null,
    updatedAt: now,
  }

  // Track which driver handles each stage so the tracking page shows the right
  // person at pickup vs drop-off, including split-driver orders.
  // pickup_only    → only pickupDriverId (dropoffDriverId set later when delivery assigned)
  // pickup_and_dropoff → both fields, same driver
  // delivery_only  → only dropoffDriverId
  if (kind === 'pickup_only') {
    setFields.pickupDriverId = new ObjectId(driverId)
  } else if (kind === 'pickup_and_dropoff') {
    setFields.pickupDriverId  = new ObjectId(driverId)
    setFields.dropoffDriverId = new ObjectId(driverId)
  } else if (kind === 'delivery_only') {
    setFields.dropoffDriverId = new ObjectId(driverId)
  }

  return db.collection('bookings').updateOne(
    { _id: new ObjectId(bookingId), status: fromStatus },
    {
      $set: setFields,
      $push: { statusHistory: { status, timestamp: now, note: 'Driver assigned' } },
    }
  )
}

/**
 * Find all bookings with status 'picked_up' (ready for delivery assignment).
 */
export async function findPickedUpBookings({ limit = 50 } = {}) {
  const db = await getDb()
  return db
    .collection('bookings')
    .find({ status: 'picked_up' })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray()
}

/**
 * Admin dashboard counters (used with Next.js cache).
 */
export async function getBookingCounters() {
  const db = await getDb()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [pending, active, todayDelivered] = await Promise.all([
    // Pending includes failed_pickup (retry) so admin sees the true to-do count
    db.collection('bookings').countDocuments({ status: { $in: ['pending', 'failed_pickup'] } }),
    db
      .collection('bookings')
      .countDocuments({ status: { $in: ['assigned_pickup', 'picked_up', 'assigned_delivery'] } }),
    db
      .collection('bookings')
      .countDocuments({ status: 'delivered', updatedAt: { $gte: today } }),
  ])

  return { pending, active, todayDelivered }
}

// Statuses that represent successfully completed revenue — everything else
// (pending/assigned/picked_up/cancelled/failed_*) is excluded from revenue
// sums so an in-flight or dead booking's estimatedPrice never counts as
// earned revenue.
const REVENUE_STATUSES = ['delivered']
const FAILED_STATUSES  = ['failed_pickup', 'failed_dropoff']

/**
 * Admin dashboard finance + ops stats — one round-trip via $facet so the
 * dashboard's Mongo cost stays constant regardless of how many charts read
 * from it. Window is the trailing `days` calendar days (default 30),
 * bucketed by day for the trend chart.
 *
 * Revenue is booking-estimated revenue (sum of estimatedPrice on delivered
 * bookings), NOT invoiced/collected cash — invoices are a separate, manually
 * created billing tool with no link back to bookings (see ARCHITECTURE.md
 * §12.2). This is the operational "value delivered" figure, not accounts
 * receivable.
 */
export async function getDashboardStats({ days = 30 } = {}) {
  const db = await getDb()
  const windowStart = new Date()
  windowStart.setHours(0, 0, 0, 0)
  windowStart.setDate(windowStart.getDate() - (days - 1))

  const [windowResult] = await db.collection('bookings').aggregate([
    { $match: { createdAt: { $gte: windowStart } } },
    {
      $facet: {
        // Per-day revenue + volume, revenue only counted for delivered bookings
        byDay: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              bookings: { $sum: 1 },
              delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
              cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
              failed: { $sum: { $cond: [{ $in: ['$status', FAILED_STATUSES] }, 1, 0] } },
              revenue: {
                $sum: {
                  $cond: [
                    { $in: ['$status', REVENUE_STATUSES] },
                    { $ifNull: ['$estimatedPrice', 0] },
                    0,
                  ],
                },
              },
            },
          },
          { $sort: { _id: 1 } },
        ],
        // Window-wide status breakdown, for the mix donut/bar
        statusBreakdown: [
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ],
        // Window-wide totals — avoids re-summing byDay client-side for the stat cards
        totals: [
          {
            $group: {
              _id: null,
              bookingCount: { $sum: 1 },
              deliveredCount: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
              failedCount: { $sum: { $cond: [{ $in: ['$status', FAILED_STATUSES] }, 1, 0] } },
              cancelledCount: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
              revenue: {
                $sum: {
                  $cond: [
                    { $in: ['$status', REVENUE_STATUSES] },
                    { $ifNull: ['$estimatedPrice', 0] },
                    0,
                  ],
                },
              },
            },
          },
        ],
      },
    },
  ]).toArray()

  const totals = windowResult.totals[0] ?? {
    bookingCount: 0, deliveredCount: 0, failedCount: 0, cancelledCount: 0, revenue: 0,
  }
  const completedCount = totals.deliveredCount + totals.failedCount + totals.cancelledCount
  const failureRate = completedCount > 0 ? totals.failedCount / completedCount : 0

  return {
    days,
    windowStart,
    byDay: windowResult.byDay,
    statusBreakdown: windowResult.statusBreakdown,
    totals: {
      ...totals,
      avgOrderValue: totals.deliveredCount > 0 ? totals.revenue / totals.deliveredCount : 0,
      failureRate,
    },
  }
}

/**
 * Get bookings assigned to a driver, optionally filtered by status group.
 * statusGroup: 'active' | 'completed' | 'all'
 */
export async function findBookingsByDriver(driverId, { statusGroup = 'all', limit = 30 } = {}) {
  const db = await getDb()
  const filter = { assignedDriverId: new ObjectId(driverId) }

  if (statusGroup === 'active') {
    filter.status = { $in: ['assigned_pickup', 'picked_up', 'assigned_delivery'] }
  } else if (statusGroup === 'completed') {
    filter.status = 'delivered'
  }

  return db
    .collection('bookings')
    .find(filter, {
      projection: {
        _id: 1, status: 1, stops: 1, assignedAt: 1,
        estimatedDistanceMeters: 1, estimatedDurationSeconds: 1, updatedAt: 1,
      },
    })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray()
}

/**
 * Stats for a driver dashboard.
 */
export async function getDriverStats(driverId) {
  const db = await getDb()
  const id = new ObjectId(driverId)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [assigned, inProgress, completedToday, completedTotal] = await Promise.all([
    db.collection('bookings').countDocuments({ assignedDriverId: id, status: { $in: ['assigned_pickup', 'assigned_delivery'] } }),
    db.collection('bookings').countDocuments({ assignedDriverId: id, status: 'picked_up' }),
    db.collection('bookings').countDocuments({ assignedDriverId: id, status: 'delivered', updatedAt: { $gte: today } }),
    db.collection('bookings').countDocuments({ assignedDriverId: id, status: 'delivered' }),
  ])

  return { assigned, inProgress, completedToday, completedTotal }
}

/**
 * Mark package items as picked up or delivered.
 *   stage: 'pickup' | 'dropoff'
 *   itemIds: array of itemId strings (must belong to booking.packageDetails.items)
 *
 * Uses a positional array filter so we only stamp the requested items.
 * Idempotent: re-stamping the same itemId is a no-op (we only set when null).
 */
export async function markBookingItems(bookingId, { stage, itemIds, driverId } = {}) {
  if (!itemIds?.length) return { matchedCount: 0, modifiedCount: 0 }
  const db = await getDb()
  const field = stage === 'dropoff' ? 'packageDetails.items.$[elem].deliveredAt' : 'packageDetails.items.$[elem].pickedUpAt'
  const now = new Date()
  const filter = { _id: new ObjectId(bookingId) }
  if (driverId) filter.assignedDriverId = new ObjectId(driverId)
  return db.collection('bookings').updateOne(
    filter,
    { $set: { [field]: now, updatedAt: now } },
    {
      arrayFilters: [{
        'elem.itemId': { $in: itemIds },
        ...(stage === 'dropoff' ? { 'elem.deliveredAt': null } : { 'elem.pickedUpAt': null }),
      }],
    }
  )
}

/**
 * Mark a booking as failed at the pickup or dropoff stage.
 *   stage: 'pickup' | 'dropoff'
 *   reason: free-form string entered by the driver
 *
 * Sets status to `failed_pickup` / `failed_dropoff`, stores the reason on
 * the booking, and appends a history entry. The driver assignment is
 * cleared so admin re-assign works the same as a fresh booking.
 */
export async function markBookingFailed(bookingId, { stage, reason, driverId } = {}) {
  const db = await getDb()
  const now = new Date()
  const newStatus = stage === 'dropoff' ? 'failed_dropoff' : 'failed_pickup'
  const note = `Marked ${stage} failed${reason ? `: ${reason}` : ''}`
  const filter = { _id: new ObjectId(bookingId) }
  if (driverId) filter.assignedDriverId = new ObjectId(driverId)
  return db.collection('bookings').updateOne(filter, {
    $set: {
      status: newStatus,
      assignedDriverId: null,
      assignedAt: null,
      lastFailure: { stage, reason: String(reason ?? '').slice(0, 500), at: now, driverId: driverId ? new ObjectId(driverId) : null },
      updatedAt: now,
    },
    $push: { statusHistory: { status: newStatus, timestamp: now, note, driverId } },
  })
}

/**
 * Cancel a booking (customer can only cancel their own pending bookings).
 */
// Statuses a customer may cancel their own booking from — nothing has been
// physically picked up yet in either state (pending: never assigned;
// failed_pickup: assignedDriverId already cleared by stop-failed). Excludes
// failed_dropoff deliberately — the package is already picked up and sitting
// with a driver at that point, so it can't simply be cancelled.
export const CUSTOMER_CANCELLABLE_STATUSES = ['pending', 'failed_pickup']

/**
 * Cancel a booking. `allowedStatuses` defaults to admin's original,
 * unchanged privilege (pending only); pass CUSTOMER_CANCELLABLE_STATUSES for
 * the customer self-service path.
 */
export async function cancelBooking(bookingId, { customerId, allowedStatuses = ['pending'] } = {}) {
  const db = await getDb()
  const filter = { _id: new ObjectId(bookingId), status: { $in: allowedStatuses } }
  if (customerId) filter.customerId = new ObjectId(customerId)

  return db.collection('bookings').updateOne(filter, {
    $set: { status: 'cancelled', updatedAt: new Date() },
    $push: { statusHistory: { status: 'cancelled', timestamp: new Date(), note: 'Booking cancelled' } },
  })
}

// Statuses eligible for the admin history soft-delete actions below — the
// same set the History page itself lists (src/app/admin/bookings/history/
// page.js's own HISTORY_STATUSES). Scoping the update filter to these
// statuses is a safety guard: it makes it impossible for "delete selected" or
// "clear history" to ever hide a booking that's still active, even if a
// stale/tampered bookingId were passed in.
const ADMIN_HISTORY_STATUSES = ['delivered', 'cancelled']

/**
 * Soft-delete (hide from the admin History page) one or more bookings by ID.
 * Does NOT remove the document — "we will be computing many values from
 * them" (dashboard stats, revenue, driver stats all read the full bookings
 * collection regardless of this flag) — it only sets a flag the History
 * page's own query excludes on. Scoped to ADMIN_HISTORY_STATUSES so this can
 * never hide a booking that isn't actually a completed/cancelled history
 * entry. No restore path — this is intentionally one-way from the admin's
 * point of view (the data itself is still in Mongo for anyone who needs it).
 */
export async function hideBookingsFromHistory(bookingIds) {
  const db = await getDb()
  return db.collection('bookings').updateMany(
    {
      _id: { $in: bookingIds.map((id) => new ObjectId(id)) },
      status: { $in: ADMIN_HISTORY_STATUSES },
    },
    { $set: { hiddenFromHistory: true, hiddenFromHistoryAt: new Date() } }
  )
}

/**
 * "Clear History" — soft-delete every booking currently eligible to appear
 * on the admin History page, regardless of any status/date/search filter the
 * admin has applied in the UI at the time (confirmed behavior: this is a
 * full reset, not scoped to the current view).
 */
export async function hideAllHistoryFromView() {
  const db = await getDb()
  return db.collection('bookings').updateMany(
    { status: { $in: ADMIN_HISTORY_STATUSES }, hiddenFromHistory: { $ne: true } },
    { $set: { hiddenFromHistory: true, hiddenFromHistoryAt: new Date() } }
  )
}

// Statuses a customer may still edit their own booking's details from —
// mirrors the scenarios that actually require a correction: not yet
// assigned, or a failed pickup/dropoff attempt that needs fixed info before
// it can be retried.
export const CUSTOMER_EDITABLE_STATUSES = ['pending', 'failed_pickup', 'failed_dropoff']

/**
 * Update a customer's own booking's editable fields (stops, package details,
 * notification emails, estimated price). Only allowed while the booking is
 * in one of CUSTOMER_EDITABLE_STATUSES — enforced in the Mongo filter itself
 * (not just app code) so a race with a status change can't silently apply a
 * stale edit. Does not touch status/statusHistory/assignment fields.
 */
export async function updateBookingDetails(bookingId, customerId, { stops, packageDetails, senderEmail, receiverEmail, estimatedPrice }) {
  const db = await getDb()
  const filter = {
    _id: new ObjectId(bookingId),
    customerId: new ObjectId(customerId),
    status: { $in: CUSTOMER_EDITABLE_STATUSES },
  }

  return db.collection('bookings').updateOne(filter, {
    $set: {
      stops,
      packageDetails: normalizePackageDetails(packageDetails),
      senderEmail:    senderEmail   || null,
      receiverEmail:  receiverEmail || null,
      estimatedPrice: estimatedPrice ?? null,
      updatedAt: new Date(),
    },
  })
}
