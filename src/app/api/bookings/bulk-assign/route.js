import { NextResponse } from 'next/server'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { findBookingsByIds, assignDriverToBooking } from '@/lib/db/bookings'
import { findDriverById, upsertDriverRoute, findActiveRoute, mergeIntoActiveRoute } from '@/lib/db/drivers'
import { pushBookingStatusChange, pushRouteUpdate } from '@/lib/pusher'
import { revalidateTag } from 'next/cache'
import redis from '@/lib/redis'
import { ObjectId } from 'mongodb'

/**
 * POST /api/bookings/bulk-assign
 * Body: {
 *   bookingIds: string[],
 *   driverId: string,
 *   assignmentType: 'pickup' | 'delivery'
 * }
 *
 * Assigns multiple bookings to one driver for either pickup or delivery.
 *
 * pickup assignment:
 *   - bookings must be in 'pending' status
 *   - takes the pickup stop from each booking
 *   - optimizes all pickup stops together
 *   - sets booking status → 'assigned_pickup'
 *
 * delivery assignment:
 *   - bookings must be in 'picked_up' status
 *   - takes the dropoff stop from each booking
 *   - optimizes all dropoff stops together
 *   - sets booking status → 'assigned_delivery'
 */
export async function POST(request) {
  try {
    await requireAdmin()

    const { bookingIds, driverId, assignmentType } = await request.json()

    if (!bookingIds?.length) {
      return NextResponse.json({ error: 'bookingIds is required' }, { status: 400 })
    }
    if (!driverId) {
      return NextResponse.json({ error: 'driverId is required' }, { status: 400 })
    }
    if (assignmentType !== 'pickup' && assignmentType !== 'delivery') {
      return NextResponse.json({ error: 'assignmentType must be pickup or delivery' }, { status: 400 })
    }

    // Verify driver exists
    const driver = await findDriverById(driverId)
    if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })

    // Load all bookings
    const bookings = await findBookingsByIds(bookingIds)
    if (bookings.length === 0) {
      return NextResponse.json({ error: 'No bookings found' }, { status: 404 })
    }

    // Validate each booking is in the right status for this assignment type
    const requiredStatus    = assignmentType === 'pickup' ? 'pending'   : 'picked_up'
    const newBookingStatus  = assignmentType === 'pickup' ? 'assigned_pickup' : 'assigned_delivery'
    const stopTypeToUse     = assignmentType === 'pickup' ? 'pickup'    : 'dropoff'
    const routePhase        = assignmentType === 'pickup' ? 'pickup'    : 'dropoff'

    const invalid = bookings.filter((b) => b.status !== requiredStatus)
    if (invalid.length > 0) {
      return NextResponse.json({
        error: `${invalid.length} booking(s) are not in '${requiredStatus}' status`,
      }, { status: 409 })
    }

    // Extract the relevant stop from each booking
    const flatStops = []
    for (const booking of bookings) {
      const stop = booking.stops.find((s) => s.type === stopTypeToUse)
      if (!stop) continue
      flatStops.push({
        bookingId:    String(booking._id),
        stopType:     stopTypeToUse,
        coordinates:  stop.coordinates,
        address:      stop.address,
        contactName:  stop.contactName  ?? null,
        contactPhone: stop.contactPhone ?? null,
        notes:        stop.notes        ?? null,
        status:       'pending',
        completedAt:  null,
        estimatedArrivalAt: null,
      })
    }

    if (flatStops.length === 0) {
      return NextResponse.json({ error: 'No valid stops found in selected bookings' }, { status: 400 })
    }

    // Store stops in insertion order — optimization happens at navigate time using driver's GPS
    const optimizedStops = flatStops.map((s, i) => ({
      ...s,
      stopIndex:     i,
      originalIndex: i,
    }))

    // Check if driver already has an active route for this same phase
    const existingRoute = await findActiveRoute(driverId)
    const existingPhase = existingRoute?.routePhase

    if (existingRoute && existingPhase === routePhase) {
      // Merge: keep completed stops, re-optimize all pending + new stops together
      const completedStops  = (existingRoute.optimizedStops ?? []).filter((s) => s.completedAt)
      const existingPending = (existingRoute.optimizedStops ?? []).filter((s) => !s.completedAt)

      // Append new stops after existing pending — optimization happens at navigate time
      const allPending = [
        ...existingPending,
        ...optimizedStops,
      ]

      const mergedOptimizedStops = allPending.map((s, visitOrder) => ({
        ...s,
        stopIndex:     completedStops.length + visitOrder,
        originalIndex: visitOrder,
      }))

      await mergeIntoActiveRoute(
        String(existingRoute._id),
        bookings.map((b) => new ObjectId(b._id)),
        [...completedStops, ...mergedOptimizedStops],
        null,
        routePhase,
      )
    } else if (existingRoute && existingPhase !== routePhase) {
      // Driver has a route for a different phase — create a new route doc
      await upsertDriverRoute(driverId, {
        assignmentIds:        bookings.map((b) => b._id),
        routePhase,
        optimizedStops,
        encodedPolyline:      null,
        totalDistanceMeters:  null,
        totalDurationSeconds: null,
        lastMatchedAt:        null,
      })
    } else {
      // No existing route — create fresh
      await upsertDriverRoute(driverId, {
        assignmentIds:        bookings.map((b) => b._id),
        routePhase,
        optimizedStops,
        encodedPolyline:      null,
        totalDistanceMeters:  null,
        totalDurationSeconds: null,
        lastMatchedAt:        null,
      })
    }

    // Update all bookings status and notify via Pusher
    await Promise.all(
      bookings.map(async (booking) => {
        await assignDriverToBooking(String(booking._id), driverId, {
          estimatedDistanceMeters:  null,
          estimatedDurationSeconds: null,
          newStatus:        newBookingStatus,
          allowedFromStatus: requiredStatus,
        })
        try {
          await pushBookingStatusChange(String(booking._id), {
            status: newBookingStatus,
            updatedAt: new Date().toISOString(),
            etaSeconds: null,
          })
        } catch { /* non-fatal */ }
      })
    )

    // Fetch the freshly written route and push it into Redis immediately.
    // This prevents any window where route-data serves a stale completed route from cache.
    try {
      const freshRoute = await findActiveRoute(driverId)
      if (freshRoute) {
        const serialized = JSON.parse(JSON.stringify(freshRoute))
        await redis.set(`driver:${driverId}:route`, serialized, { ex: 300 })
        // Push live update if driver already has the map open
        try { await pushRouteUpdate(driverId, serialized) } catch { /* non-fatal */ }
      } else {
        await redis.del(`driver:${driverId}:route`)
      }
    } catch { /* non-fatal */ }

    revalidateTag('booking-counters')

    return NextResponse.json({
      success: true,
      assigned: bookings.length,
      merged: Boolean(existingRoute && existingPhase === routePhase),
    })
  } catch (err) {
    return handleApiError(err, '[POST /api/bookings/bulk-assign]')
  }
}
