import { NextResponse } from 'next/server'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { findBookingById } from '@/lib/db/bookings'

/**
 * POST /api/bookings/[bookingId]/assign
 * Body: { driverId: string }
 *
 * Single-booking assignment. Delegates to the bulk-assign endpoint so
 * all route-merging and optimization logic lives in one place.
 *
 * - pending booking    → assignmentType: 'pickup'
 * - picked_up booking  → assignmentType: 'delivery'
 */
export async function POST(request, { params }) {
  try {
    const { bookingId } = await params
    await requireAdmin()

    const { driverId } = await request.json()
    if (!driverId) {
      return NextResponse.json({ error: 'driverId is required' }, { status: 400 })
    }

    const booking = await findBookingById(bookingId)
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const statusToType = {
      pending:   'pickup',
      picked_up: 'delivery',
    }
    const assignmentType = statusToType[booking.status]
    if (!assignmentType) {
      return NextResponse.json(
        { error: `Cannot assign a booking with status '${booking.status}'` },
        { status: 409 }
      )
    }

    // Forward to bulk-assign (same server, internal fetch)
    const origin = request.headers.get('origin') ?? request.nextUrl.origin
    const res = await fetch(`${origin}/api/bookings/bulk-assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the cookie header so requireAdmin() in bulk-assign can auth
        Cookie: request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify({ bookingIds: [bookingId], driverId, assignmentType }),
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json(data, { status: res.status })

    return NextResponse.json({ success: true, merged: data.merged ?? false })
  } catch (err) {
    return handleApiError(err, '[POST /api/bookings/[bookingId]/assign]')
  }
}
