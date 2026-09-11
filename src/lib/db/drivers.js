import { ObjectId } from 'mongodb'
import { getDb } from './client.js'
import { calgaryStartOfToday, calgaryStartOfDay, calgaryEndOfDay, calgaryDateKey, CALGARY_TZ } from '../dateFormat.js'

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const DISTANCE_RANGES = ['day', 'week', 'month', 'year']

/**
 * [start, end) window for a distance-range filter, anchored to the Calgary
 * calendar day/week/month/year containing "now" — never the server's local
 * timezone (see calgaryStartOfToday doc comment).
 * 'week' starts Monday, matching how most drivers think about a work week.
 *
 * Built entirely on calgaryDateKey/calgaryStartOfDay/calgaryEndOfDay — never
 * a Date object's local getDate()/getDay()/setDate(), which read the Node
 * PROCESS's own timezone (its `TZ` env, or OS default), not Calgary's. On
 * Vercel that process timezone happens to be UTC, which coincidentally lines
 * up with Calgary's calendar date for every instant Calgary is ever behind
 * UTC by — but any dev machine or script runner with a different TZ (this
 * repo's own CI/local dev is not guaranteed to be UTC) would silently read
 * the wrong day-of-month/day-of-week whenever the two clocks disagree, and
 * quietly shift the day/week window by a day. Same fix already applied to
 * driverHistoryRangeWindow in db/bookings.js — this brings that one in line
 * with it. When day/week/month/year math is needed, it happens on calendar-
 * date STRINGS (immune to any process timezone) via a UTC-noon anchor, and
 * only the final start/end resolve through the real Calgary-midnight probe.
 */
function distanceRangeWindow(range) {
  const todayKey = calgaryDateKey()

  if (range === 'day') {
    return { start: calgaryStartOfDay(todayKey), end: calgaryEndOfDay(todayKey) }
  }

  if (range === 'week') {
    // UTC-noon anchor for the day-of-week/day-stepping arithmetic — a plain
    // calendar-date computation immune to the process's own timezone, only
    // the resulting calendar-date strings are handed back to the real
    // Calgary-midnight probe below.
    const noon = new Date(`${todayKey}T12:00:00.000Z`)
    const dayOfWeek = noon.getUTCDay() // 0=Sun..6=Sat
    const daysSinceMonday = (dayOfWeek + 6) % 7
    const monday = new Date(noon)
    monday.setUTCDate(monday.getUTCDate() - daysSinceMonday)
    const sunday = new Date(monday)
    sunday.setUTCDate(sunday.getUTCDate() + 6)
    const mondayKey = monday.toISOString().slice(0, 10)
    const sundayKey = sunday.toISOString().slice(0, 10)
    return { start: calgaryStartOfDay(mondayKey), end: calgaryEndOfDay(sundayKey) }
  }

  if (range === 'year') {
    const [year] = todayKey.split('-')
    return { start: calgaryStartOfDay(`${year}-01-01`), end: calgaryEndOfDay(`${year}-12-31`) }
  }

  // 'month' (default)
  const [year, month] = todayKey.split('-')
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
  return {
    start: calgaryStartOfDay(`${year}-${month}-01`),
    end:   calgaryEndOfDay(`${year}-${month}-${String(lastDay).padStart(2, '0')}`),
  }
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Mongo $group _id expression + a fn to build the full ordered bucket list
// (so empty buckets show as 0 instead of being missing from the series),
// per distance-range granularity. All date operators are Calgary-anchored
// via `timezone: CALGARY_TZ` — the same reasoning as calgaryStartOfToday.
//
// Buckets on `updatedAt`, NOT `createdAt` — see getDriverDistanceForRange's
// doc comment for why: a route's `drivenDistanceMeters` is one running total
// with no per-day split, so whichever single day it's credited to must be
// the day driving actually happened. `updatedAt` is stamped by updateRoute()
// on every stop-complete/stop-failed/reroute, so on a finished route it's the
// moment the LAST leg was driven — matching the deliveries-per-day chart
// (bookings.updatedAt) it's rendered next to on the driver detail page.
function distanceBucketSpec(range, start, dateField = '$updatedAt') {
  if (range === 'day') {
    return {
      groupId: { $hour: { date: dateField, timezone: CALGARY_TZ } },
      buckets: Array.from({ length: 24 }, (_, h) => ({
        id: h,
        label: h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`,
      })),
    }
  }
  if (range === 'week') {
    return {
      groupId: { $dayOfWeek: { date: dateField, timezone: CALGARY_TZ } }, // 1=Sun..7=Sat
      // Reorder Mon..Sun to match distanceRangeWindow's Monday-start week.
      buckets: [1, 2, 3, 4, 5, 6, 0].map((wd) => ({ id: wd + 1, label: WEEKDAY_SHORT[wd] })),
    }
  }
  if (range === 'year') {
    return {
      groupId: { $month: { date: dateField, timezone: CALGARY_TZ } },
      buckets: MONTHS_SHORT.map((label, i) => ({ id: i + 1, label })),
    }
  }
  // 'month' — one bucket per calendar day of the selected month. `start` is
  // the Calgary-midnight instant for day 1 of that month (from
  // distanceRangeWindow) — read its Calgary calendar date via calgaryDateKey,
  // never .getFullYear()/.getMonth() (local-to-the-Node-process, not
  // Calgary; see distanceRangeWindow's own doc comment for why that's unsafe).
  const [y, m] = calgaryDateKey(start).split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return {
    groupId: { $dayOfMonth: { date: dateField, timezone: CALGARY_TZ } },
    buckets: Array.from({ length: daysInMonth }, (_, i) => ({ id: i + 1, label: String(i + 1) })),
  }
}

/**
 * Sum of routes.drivenDistanceMeters for routes LAST TOUCHED (updatedAt)
 * within the given Calgary-anchored range for this driver, plus a bucketed
 * series for the distance chart (hourly for 'day', daily for 'week'/'month',
 * monthly for 'year' — empty buckets included as 0 so the chart has a
 * consistent x-axis).
 *
 * Uses updatedAt, not createdAt: drivenDistanceMeters is one running total
 * per route with no per-day split, so the whole distance has to be credited
 * to a single day — and updatedAt (stamped by updateRoute() on every
 * stop-complete/stop-failed/reroute) is the day the LAST leg was actually
 * driven, which for a finished route is when the distance total stopped
 * growing. createdAt (when the route was first assigned) was used previously
 * and is wrong for any route that starts one day and finishes into the next
 * (an evening/overnight shift) — it silently misattributed the entire
 * route's km to the earlier day, showing 0 on the day the driver was
 * actually still delivering. Confirmed against real data: a route created
 * 21:58 Calgary Aug 17 with its 17th and final delivery completed 19:23
 * Calgary Aug 18 had all 213km credited to Aug 17, while the deliveries
 * chart (bookings.updatedAt — see getDriverStats below) correctly showed
 * all 17 deliveries on Aug 18. Matching this field to that chart's is the
 * point: they're rendered stacked on the same page/date-axis on the admin
 * driver detail page and must agree.
 *
 * Still an approximation for a route that stays active and gets touched
 * again on a LATER day with no new distance (e.g. a merge-notice reroute
 * with 0 driven since) — the ~2% of routes with a >20h createdAt/updatedAt
 * gap while inactive, checked against live data before this change, showed
 * that's rare in practice; a fully exact fix needs per-day distance
 * tracking on the route doc, not just this single running total.
 */
export async function getDriverDistanceForRange(driverId, range = 'month') {
  const safeRange = DISTANCE_RANGES.includes(range) ? range : 'month'
  const db = await getDb()
  const objId = new ObjectId(driverId)
  const { start, end } = distanceRangeWindow(safeRange)
  const { groupId, buckets } = distanceBucketSpec(safeRange, start)

  const rows = await db.collection('routes').aggregate([
    { $match: { driverId: objId, updatedAt: { $gte: start, $lte: end } } },
    { $group: { _id: groupId, meters: { $sum: { $ifNull: ['$drivenDistanceMeters', 0] } } } },
  ]).toArray()
  const byId = new Map(rows.map((r) => [r._id, r.meters]))

  const series = buckets.map((b) => ({ label: b.label, meters: byId.get(b.id) ?? 0 }))
  const distanceMeters = series.reduce((sum, s) => sum + s.meters, 0)

  return { range: safeRange, distanceMeters, series }
}

/**
 * Sum of routes.initialEstimatedDurationSeconds for routes CREATED (createdAt)
 * within the given Calgary-anchored range for this driver, plus a bucketed
 * series for the chart — same shape/granularity as getDriverDistanceForRange.
 *
 * Uses createdAt, not updatedAt: unlike drivenDistanceMeters (a running total
 * that grows across a route's whole life, so it has to be credited to
 * whichever day it stopped growing), initialEstimatedDurationSeconds is a
 * single snapshot written once, at route start (see reoptimizeRoute) — the
 * day the route was created IS the day that estimate belongs to, no
 * cross-midnight attribution problem to work around.
 *
 * Rough estimate by design: it's ORS's one-time planned-route-duration guess
 * from the moment the driver set their end-point, not measured elapsed time.
 * Routes created before this field existed have it as null/absent and
 * contribute 0, same as a route with no completed reoptimize yet.
 */
export async function getDriverEstimatedHoursForRange(driverId, range = 'month') {
  const safeRange = DISTANCE_RANGES.includes(range) ? range : 'month'
  const db = await getDb()
  const objId = new ObjectId(driverId)
  const { start, end } = distanceRangeWindow(safeRange)
  const { groupId, buckets } = distanceBucketSpec(safeRange, start, '$createdAt')

  const rows = await db.collection('routes').aggregate([
    { $match: { driverId: objId, createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: groupId, seconds: { $sum: { $ifNull: ['$initialEstimatedDurationSeconds', 0] } } } },
  ]).toArray()
  const byId = new Map(rows.map((r) => [r._id, r.seconds]))

  const series = buckets.map((b) => ({ label: b.label, seconds: byId.get(b.id) ?? 0 }))
  const durationSeconds = series.reduce((sum, s) => sum + s.seconds, 0)

  return { range: safeRange, durationSeconds, series }
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
 *   distanceSeries            — [{label, meters}, ...] bucketed for the distance
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

  // Distance-driven stat for the requested range (day/week/month/year, Calgary-anchored)
  const distanceForRange = await getDriverDistanceForRange(driverId, distanceRange)

  // Estimated route-hours stat for the same range — see getDriverEstimatedHoursForRange.
  const estimatedHoursForRange = await getDriverEstimatedHoursForRange(driverId, distanceRange)

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
    estimatedHoursRangeSeconds: estimatedHoursForRange.durationSeconds,
    estimatedHoursSeries: estimatedHoursForRange.series,
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
    initialEstimatedDurationSeconds: null,
    initialEstimatedDistanceMeters:  null,
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
