import { NextResponse } from 'next/server'
import { requireDriver, handleApiError } from '@/lib/dal'
import { findActiveRoute, updateRoute, incrementDrivenDistance } from '@/lib/db/drivers'
import { updateBookingStatus } from '@/lib/db/bookings'
import { pushBookingStatusChange, pushRouteUpdate } from '@/lib/pusher'
import { hydrateRouteItems } from '@/lib/routing/hydrate'
import redis from '@/lib/redis'

const MAX_BATCH_SIZE = 50
const MAX_WRITE_ATTEMPTS = 5

/**
 * Decide the next booking status when a stop is completed.
 * Pickup stops → picked_up; dropoff stops → delivered; endpoint → no change.
 * (Mirrors stop-complete/route.js — kept in sync intentionally, not shared,
 * since it's a single 3-line branch.)
 */
function nextBookingStatus(stop) {
  if (stop.stopType === 'pickup')  return 'picked_up'
  if (stop.stopType === 'dropoff') return 'delivered'
  return null
}

/**
 * POST /api/drivers/[driverId]/batch-stop-complete
 * Body: { stopIndexes: number[], drivenMeters?, currentLng?, currentLat? }
 *
 * Confirms multiple stops in one call — for the common case where several
 * bookings share the same pickup/dropoff address, so the driver doesn't have
 * to confirm them one at a time. Applies the exact same per-stop rules as
 * POST /stop-complete (idempotent on completedAt, same clearDriver rule),
 * just looped over one route write instead of N separate HTTP round-trips.
 *
 * drivenMeters is applied ONCE for the whole batch (not per stop) — the
 * premise for batching is that these stops share a location, so there is
 * only one real GPS distance value to record, not N.
 */
export async function POST(request, { params }) {
  try {
    const { driverId } = await params
    const { userId } = await requireDriver()

    if (driverId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { stopIndexes, drivenMeters } = await request.json()
    if (!Array.isArray(stopIndexes) || stopIndexes.length === 0) {
      return NextResponse.json({ error: 'stopIndexes is required' }, { status: 400 })
    }
    if (stopIndexes.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `Cannot confirm more than ${MAX_BATCH_SIZE} stops at once` }, { status: 400 })
    }
    if (!stopIndexes.every((n) => typeof n === 'number' && Number.isInteger(n))) {
      return NextResponse.json({ error: 'stopIndexes must be integers' }, { status: 400 })
    }

    let route = await findActiveRoute(driverId)
    if (!route) {
      return NextResponse.json({ error: 'No active route' }, { status: 404 })
    }

    const now = new Date()

    // The compute-then-write below is wrapped in an optimistic-lock retry —
    // see stop-complete/route.js for the full rationale (a concurrent
    // bulk-assign merge or reroute can silently discard this write
    // otherwise). On a matchedCount:0 conflict we re-read and recompute.
    let stops, toComplete, updatedStops, allDone, routeUpdateData

    for (let attempt = 1; ; attempt++) {
      stops = route.optimizedStops ?? []
      const uniqueIndexes = [...new Set(stopIndexes)]
      if (uniqueIndexes.some((i) => i < 0 || i >= stops.length)) {
        return NextResponse.json({ error: 'Invalid stopIndex in batch' }, { status: 400 })
      }

      // Split into already-completed (idempotent no-ops) vs. newly-completing —
      // same guard as the single-stop endpoint, just per-item instead of
      // short-circuiting the whole request.
      toComplete = uniqueIndexes.filter((i) => !stops[i].completedAt)

      if (toComplete.length === 0) {
        // Every selected stop was already completed (retry/double-tap) — return
        // current state without touching MongoDB, same as single-stop idempotency.
        const cacheKey = `driver:${driverId}:route`
        let cached = null
        try { cached = await redis.get(cacheKey) } catch { /* swallow */ }
        const finalRoute = cached ?? await hydrateRouteItems(JSON.parse(JSON.stringify(route)))
        return NextResponse.json({ success: true, idempotent: true, route: finalRoute })
      }

      const toCompleteSet = new Set(toComplete)
      updatedStops = stops.map((s, i) =>
        toCompleteSet.has(i) ? { ...s, completedAt: now } : s
      )
      allDone = updatedStops.every((s) => s.completedAt)

      routeUpdateData = {
        optimizedStops: updatedStops,
        ...(allDone ? { isActive: false } : {}),
      }

      const writeResult = await updateRoute(String(route._id), routeUpdateData, route.updatedAt)
      if (writeResult.matchedCount > 0) break

      if (attempt >= MAX_WRITE_ATTEMPTS) {
        return NextResponse.json(
          { error: 'Route kept changing — please try again.', code: 'ROUTE_CONFLICT' },
          { status: 409 },
        )
      }
      route = await findActiveRoute(driverId)
      if (!route) {
        return NextResponse.json({ error: 'No active route' }, { status: 404 })
      }
    }

    // Persist distance driven once for the whole batch (see doc comment above).
    if (typeof drivenMeters === 'number' && drivenMeters > 0) {
      incrementDrivenDistance(driverId, String(route._id), Math.round(drivenMeters)).catch(() => {})
    }

    // Update each booking's status + push a status-change event — grouped BY
    // BOOKING, not per stop.
    //
    // A single batch can contain both the pickup AND the dropoff of the same
    // booking (routine when one address serves as both, or when a driver
    // confirms a whole pickup_and_dropoff leg at once). Issuing one
    // updateBookingStatus per stop would then fire two concurrent updateOne
    // calls against the same document: $push makes both statusHistory
    // entries land, but $set status is last-write-wins with no defined
    // winner — so 'picked_up' can overwrite 'delivered' and strand an
    // already-delivered booking on "Ready to Deliver", which then gets
    // re-dispatched to a driver. Collapsing to one write per booking,
    // carrying the terminal status, removes the race entirely.
    // (batch-stop-failed guards the same hazard via toFailForBookingUpdate.)
    const byBooking = new Map()
    for (const i of toComplete) {
      const stop = stops[i]
      if (!stop.bookingId || !nextBookingStatus(stop)) continue
      const key = String(stop.bookingId)
      if (!byBooking.has(key)) byBooking.set(key, [])
      byBooking.get(key).push({ index: i, stop })
    }

    await Promise.all(
      [...byBooking.entries()].map(async ([bookingId, entries]) => {
        // 'delivered' (dropoff) is terminal and outranks 'picked_up' (pickup)
        // whenever both legs of one booking complete in the same batch.
        const dropoffEntry = entries.find((e) => e.stop.stopType === 'dropoff')
        const finalEntry   = dropoffEntry ?? entries[0]
        const newBookingStatus = nextBookingStatus(finalEntry.stop)

        // Only a pickup_only pickup releases the driver for re-assignment —
        // and that kind never has a dropoff stop in the route, so a collapsed
        // pickup+dropoff pair must never clear the driver.
        const clearDriver = !dropoffEntry
          && finalEntry.stop.stopType === 'pickup'
          && finalEntry.stop.assignmentKind === 'pickup_only'

        // Name every stop the booking actually completed, so collapsing two
        // stops into one status write doesn't lose them from the audit trail.
        const note = `${entries.map((e) => `Stop ${e.index + 1} (${e.stop.stopType})`).join(', ')} completed by driver (batch)`

        await updateBookingStatus(bookingId, newBookingStatus, { note, driverId, clearDriver })
        try {
          await pushBookingStatusChange(bookingId, {
            status: newBookingStatus,
            updatedAt: now.toISOString(),
            etaSeconds: null,
          })
        } catch { /* non-fatal */ }
      })
    )

    const finalRoute = { ...JSON.parse(JSON.stringify(route)), ...routeUpdateData }
    const hydrated = await hydrateRouteItems(finalRoute)

    try {
      if (allDone) {
        await redis.del(`driver:${driverId}:route`)
      } else {
        await redis.set(`driver:${driverId}:route`, hydrated, { ex: 300 })
      }
    } catch {
      try { await redis.del(`driver:${driverId}:route`) } catch { /* swallow */ }
    }

    if (!allDone) {
      try { await pushRouteUpdate(driverId, hydrated) } catch { /* non-fatal */ }
    }

    return NextResponse.json({ success: true, route: hydrated, completedCount: toComplete.length })
  } catch (err) {
    return handleApiError(err, '[POST /api/drivers/[driverId]/batch-stop-complete]')
  }
}
