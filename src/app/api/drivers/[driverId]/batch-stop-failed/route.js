import { NextResponse } from 'next/server'
import { requireDriver, handleApiError } from '@/lib/dal'
import { findActiveRoute, updateRoute, incrementDrivenDistance } from '@/lib/db/drivers'
import { markBookingFailed } from '@/lib/db/bookings'
import { pushBookingStatusChange, pushRouteUpdate } from '@/lib/pusher'
import { hydrateRouteItems } from '@/lib/routing/hydrate'
import redis from '@/lib/redis'

const MAX_BATCH_SIZE = 50

/**
 * POST /api/drivers/[driverId]/batch-stop-failed
 * Body: { stopIndexes: number[], reason: string, drivenMeters?: number }
 *
 * Marks multiple stops as failed with ONE shared reason — same per-booking
 * rules as POST /stop-failed applied to each selected stop:
 *   - booking → 'failed_pickup' / 'failed_dropoff'
 *   - pickup_and_dropoff pickup failure auto-cancels its paired dropoff stop
 *   - route stop → { completedAt, failedAt, failureReason } (skipped in queue)
 *
 * drivenMeters is applied ONCE for the whole batch, same rationale as
 * batch-stop-complete — these stops are assumed to share one location.
 */
export async function POST(request, { params }) {
  try {
    const { driverId } = await params
    const { userId } = await requireDriver()

    if (driverId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { stopIndexes, reason, drivenMeters } = await request.json()
    if (!Array.isArray(stopIndexes) || stopIndexes.length === 0) {
      return NextResponse.json({ error: 'stopIndexes is required' }, { status: 400 })
    }
    if (stopIndexes.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `Cannot fail more than ${MAX_BATCH_SIZE} stops at once` }, { status: 400 })
    }
    if (!stopIndexes.every((n) => typeof n === 'number' && Number.isInteger(n))) {
      return NextResponse.json({ error: 'stopIndexes must be integers' }, { status: 400 })
    }
    const trimmedReason = String(reason ?? '').trim().slice(0, 500)
    if (!trimmedReason) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
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
    if (uniqueIndexes.some((i) => stops[i].stopType === 'endpoint')) {
      return NextResponse.json({ error: 'Cannot fail endpoint stop' }, { status: 400 })
    }

    const now = new Date()

    // Skip stops already completed/failed (idempotent no-op per item, same
    // guard as the single-stop endpoint).
    const toFail = uniqueIndexes.filter((i) => !stops[i].completedAt)

    if (toFail.length === 0) {
      const cacheKey = `driver:${driverId}:route`
      let cached = null
      try { cached = await redis.get(cacheKey) } catch { /* swallow */ }
      const finalRoute = cached ?? await hydrateRouteItems(JSON.parse(JSON.stringify(route)))
      return NextResponse.json({ success: true, idempotent: true, route: finalRoute })
    }

    const toFailSet = new Set(toFail)

    // Any pickup_and_dropoff stop in the batch whose pickup is failing also
    // auto-cancels its paired dropoff — same rule as the single-stop endpoint,
    // applied per booking. Collect booking IDs whose pickup is failing so both
    // the paired-dropoff pass below AND the booking-status pass further down
    // can find them.
    const pickupFailingBookingIds = new Set(
      toFail
        .map((i) => stops[i])
        .filter((s) => s.stopType === 'pickup' && s.assignmentKind === 'pickup_and_dropoff')
        .map((s) => String(s.bookingId))
    )

    let pairedDropoffCancelledCount = 0
    const updatedStops = stops.map((s, i) => {
      if (toFailSet.has(i)) {
        return { ...s, completedAt: now, failedAt: now, failureReason: trimmedReason }
      }
      if (
        !s.completedAt &&
        s.stopType === 'dropoff' &&
        s.assignmentKind === 'pickup_and_dropoff' &&
        pickupFailingBookingIds.has(String(s.bookingId))
      ) {
        pairedDropoffCancelledCount += 1
        return { ...s, completedAt: now, failedAt: now, failureReason: 'Pickup failed — dropoff skipped' }
      }
      return s
    })
    const allDone = updatedStops.every((s) => s.completedAt)

    const routeUpdateData = {
      optimizedStops: updatedStops,
      ...(allDone ? { isActive: false } : {}),
    }
    await updateRoute(String(route._id), routeUpdateData)

    if (typeof drivenMeters === 'number' && drivenMeters > 0) {
      incrementDrivenDistance(driverId, String(route._id), Math.round(drivenMeters)).catch(() => {})
    }

    // Update each booking → failed_pickup / failed_dropoff + push status change,
    // same rules as the single-stop endpoint, looped. Edge case: if a driver
    // selects BOTH stops of the same pickup_and_dropoff booking in one batch,
    // only process the pickup — a pickup failure already implies the dropoff
    // is cancelled (see updatedStops above and pickupFailingBookingIds), so
    // writing the booking status twice for one bookingId would race two
    // concurrent updateOne calls against the same document with no defined
    // winner. This mirrors the single-stop endpoint, which only ever fails
    // one stage per call.
    const toFailForBookingUpdate = toFail.filter((i) => {
      const s = stops[i]
      return !(s.stopType === 'dropoff' && pickupFailingBookingIds.has(String(s.bookingId)))
    })

    await Promise.all(
      toFailForBookingUpdate.map(async (i) => {
        const stop = stops[i]
        if (!stop.bookingId) return
        await markBookingFailed(String(stop.bookingId), {
          stage: stop.stopType === 'dropoff' ? 'dropoff' : 'pickup',
          reason: trimmedReason,
          driverId,
        })
        const failedStatus = stop.stopType === 'dropoff' ? 'failed_dropoff' : 'failed_pickup'
        try {
          await pushBookingStatusChange(String(stop.bookingId), {
            status: failedStatus,
            updatedAt: now.toISOString(),
            etaSeconds: null,
          })
        } catch { /* non-fatal */ }
      })
    )

    const pendingCount = updatedStops.filter(
      (s) => !s.completedAt && s.stopType !== 'endpoint',
    ).length

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

    return NextResponse.json({
      success: true,
      route: hydrated,
      failedCount: toFail.length,
      pairedDropoffCancelled: pairedDropoffCancelledCount > 0,
      pendingCount,
    })
  } catch (err) {
    return handleApiError(err, '[POST /api/drivers/[driverId]/batch-stop-failed]')
  }
}
