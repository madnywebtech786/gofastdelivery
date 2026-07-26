import { NextResponse } from 'next/server'
import { requireDriver, handleApiError } from '@/lib/dal'
import { findActiveRoute, updateRoute, incrementDrivenDistance } from '@/lib/db/drivers'
import { updateBookingStatus } from '@/lib/db/bookings'
import { pushBookingStatusChange, pushRouteUpdate } from '@/lib/pusher'
import { hydrateRouteItems } from '@/lib/routing/hydrate'
import redis from '@/lib/redis'

const MAX_BATCH_SIZE = 50

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

    const route = await findActiveRoute(driverId)
    if (!route) {
      return NextResponse.json({ error: 'No active route' }, { status: 404 })
    }

    const stops = route.optimizedStops ?? []
    const uniqueIndexes = [...new Set(stopIndexes)]
    if (uniqueIndexes.some((i) => i < 0 || i >= stops.length)) {
      return NextResponse.json({ error: 'Invalid stopIndex in batch' }, { status: 400 })
    }

    const now = new Date()

    // Split into already-completed (idempotent no-ops) vs. newly-completing —
    // same guard as the single-stop endpoint, just per-item instead of
    // short-circuiting the whole request.
    const toComplete = uniqueIndexes.filter((i) => !stops[i].completedAt)

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
    const updatedStops = stops.map((s, i) =>
      toCompleteSet.has(i) ? { ...s, completedAt: now } : s
    )
    const allDone = updatedStops.every((s) => s.completedAt)

    const routeUpdateData = {
      optimizedStops: updatedStops,
      ...(allDone ? { isActive: false } : {}),
    }
    await updateRoute(String(route._id), routeUpdateData)

    // Persist distance driven once for the whole batch (see doc comment above).
    if (typeof drivenMeters === 'number' && drivenMeters > 0) {
      incrementDrivenDistance(driverId, String(route._id), Math.round(drivenMeters)).catch(() => {})
    }

    // Update each booking's status + push a status-change event, same rules
    // as the single-stop endpoint, just looped.
    await Promise.all(
      toComplete.map(async (i) => {
        const stop = stops[i]
        const newBookingStatus = nextBookingStatus(stop)
        if (!stop.bookingId || !newBookingStatus) return

        const clearDriver = stop.stopType === 'pickup' && stop.assignmentKind === 'pickup_only'
        await updateBookingStatus(String(stop.bookingId), newBookingStatus, {
          note: `Stop ${i + 1} (${stop.stopType}) completed by driver (batch)`,
          driverId,
          clearDriver,
        })
        try {
          await pushBookingStatusChange(String(stop.bookingId), {
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
