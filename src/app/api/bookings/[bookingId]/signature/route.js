import { NextResponse } from 'next/server'
import { verifySession, handleApiError } from '@/lib/dal'
import { findBookingById } from '@/lib/db/bookings'
import { getSignatureViewUrl } from '@/lib/s3'

/**
 * GET /api/bookings/[bookingId]/signature
 *
 * Returns a short-lived presigned URL for the dropoff stop's signature, if
 * one exists. Customers may only view their own booking's signature; admins
 * may view any. Drivers are not granted access here — they only ever write
 * a signature (via /api/drivers/[driverId]/signature), never read one back.
 */
export async function GET(request, { params }) {
  try {
    const { bookingId } = await params
    const { userId, role } = await verifySession()

    if (role !== 'admin' && role !== 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const booking = role === 'admin'
      ? await findBookingById(bookingId)
      : await findBookingById(bookingId, { customerId: userId })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const dropoffStop = booking.stops?.find((s) => s.type === 'dropoff')
    if (!dropoffStop?.signatureKey) {
      return NextResponse.json({ error: 'No signature on this booking' }, { status: 404 })
    }

    const url = await getSignatureViewUrl(dropoffStop.signatureKey)
    return NextResponse.json({ url, signerName: dropoffStop.signerName ?? null })
  } catch (err) {
    return handleApiError(err, '[GET /api/bookings/[bookingId]/signature]')
  }
}
