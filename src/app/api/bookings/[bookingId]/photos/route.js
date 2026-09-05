import { NextResponse } from 'next/server'
import { verifySession, handleApiError } from '@/lib/dal'
import { findBookingById } from '@/lib/db/bookings'
import { getDeliveryPhotoViewUrl } from '@/lib/s3'

/**
 * GET /api/bookings/[bookingId]/photos?stopType=pickup|dropoff
 *
 * Returns short-lived presigned URLs for every photo captured at the given
 * stop, if any exist. Same access rule as the signature route: customers
 * may only view their own booking's photos; admins may view any; drivers
 * are not granted read access here (they only ever write, via
 * /api/drivers/[driverId]/photos).
 */
export async function GET(request, { params }) {
  try {
    const { bookingId } = await params
    const { userId, role } = await verifySession()

    if (role !== 'admin' && role !== 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const stopType = new URL(request.url).searchParams.get('stopType')
    if (stopType !== 'pickup' && stopType !== 'dropoff') {
      return NextResponse.json({ error: 'stopType must be "pickup" or "dropoff"' }, { status: 400 })
    }

    const booking = role === 'admin'
      ? await findBookingById(bookingId)
      : await findBookingById(bookingId, { customerId: userId })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const stop = booking.stops?.find((s) => s.type === stopType)
    const photoKeys = stop?.photoKeys ?? []
    if (photoKeys.length === 0) {
      return NextResponse.json({ urls: [] })
    }

    const urls = await Promise.all(photoKeys.map((key) => getDeliveryPhotoViewUrl(key)))
    return NextResponse.json({ urls: urls.filter(Boolean) })
  } catch (err) {
    return handleApiError(err, '[GET /api/bookings/[bookingId]/photos]')
  }
}
