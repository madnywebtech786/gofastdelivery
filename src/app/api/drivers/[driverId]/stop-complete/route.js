import { NextResponse } from 'next/server'
import { requireDriver, handleApiError } from '@/lib/dal'
import { findActiveRoute, updateRoute } from '@/lib/db/drivers'
import { updateBookingStatus, findBookingById } from '@/lib/db/bookings'
import { pushBookingStatusChange, pushRouteUpdate } from '@/lib/pusher'
import { sendStatusUpdate } from '@/lib/mailer'
import redis from '@/lib/redis'

/**
 * POST /api/drivers/[driverId]/stop-complete
 * Body: { stopIndex: number }
 *
 * Marks a stop as completed and updates the corresponding booking status.
 *
 * pickup stop  → booking: picked_up
 * dropoff stop → booking: delivered
 *
 * When ALL stops in the route are done, deactivates the route.
 * Phase transitions (pickup → delivery) are controlled by the admin
 * via POST /api/bookings/bulk-assign, not by this endpoint.
 */
export async function POST(request, { params }) {
  try {
    const { driverId } = await params
    const { userId } = await requireDriver()

    if (driverId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { stopIndex } = await request.json()
    if (typeof stopIndex !== 'number') {
      return NextResponse.json({ error: 'stopIndex is required' }, { status: 400 })
    }

    const route = await findActiveRoute(driverId)
    if (!route) {
      return NextResponse.json({ error: 'No active route' }, { status: 404 })
    }

    const stops = route.optimizedStops ?? []
    if (stopIndex < 0 || stopIndex >= stops.length) {
      return NextResponse.json({ error: 'Invalid stopIndex' }, { status: 400 })
    }

    const stop = stops[stopIndex]
    const now  = new Date()

    // Mark stop completed
    const updatedStops = stops.map((s, i) =>
      i === stopIndex ? { ...s, completedAt: now } : s
    )

    const allDone = updatedStops.every((s) => s.completedAt)

    const routeUpdateData = {
      optimizedStops: updatedStops,
      ...(allDone ? { isActive: false } : {}),
    }

    await updateRoute(String(route._id), routeUpdateData)

    // Booking status: pickup done → picked_up, dropoff done → delivered
    const newBookingStatus = stop.stopType === 'pickup' ? 'picked_up' : 'delivered'

    if (stop.bookingId) {
      await updateBookingStatus(String(stop.bookingId), newBookingStatus, {
        note: `Stop ${stopIndex + 1} (${stop.stopType}) completed by driver`,
        driverId,
      })
      try {
        await pushBookingStatusChange(String(stop.bookingId), {
          status: newBookingStatus,
          updatedAt: now.toISOString(),
          etaSeconds: null,
        })
      } catch { /* non-fatal */ }

      // Send status update email on picked_up and delivered
      if (newBookingStatus === 'picked_up' || newBookingStatus === 'delivered') {
        try {
          const booking = await findBookingById(String(stop.bookingId))
          if (booking && (booking.senderEmail || booking.receiverEmail)) {
            const base = process.env.APP_BASE_URL ?? 'http://localhost:3000'
            const trackingUrl = `${base}/track/${booking.trackingToken}`
            sendStatusUpdate({ booking: JSON.parse(JSON.stringify(booking)), trackingUrl, newStatus: newBookingStatus })
              .catch((e) => console.error('[mailer] status update:', e))
          }
        } catch { /* non-fatal */ }
      }
    }

    // Redis cache
    const finalRoute = { ...JSON.parse(JSON.stringify(route)), ...routeUpdateData }
    try {
      if (allDone) {
        await redis.del(`driver:${driverId}:route`)
      } else {
        await redis.set(`driver:${driverId}:route`, finalRoute, { ex: 300 })
      }
    } catch { /* non-fatal */ }

    // Push updated route to driver's open map
    if (!allDone) {
      try {
        await pushRouteUpdate(driverId, finalRoute)
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ success: true, route: finalRoute, newBookingStatus })
  } catch (err) {
    return handleApiError(err, '[POST /api/drivers/[driverId]/stop-complete]')
  }
}
