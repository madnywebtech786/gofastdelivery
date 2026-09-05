import { NextResponse } from 'next/server'
import { requireDriver, handleApiError } from '@/lib/dal'
import { uploadDeliveryPhoto, deleteDeliveryPhoto } from '@/lib/s3'
import { findActiveRoute } from '@/lib/db/drivers'
import { ObjectId } from 'mongodb'

/**
 * POST /api/drivers/[driverId]/photos
 * multipart/form-data: file, bookingId, stopType ('pickup'|'dropoff')
 *
 * Staging upload only — same convention as signature/route.js. The returned
 * key is only persisted onto the booking/route once the driver actually
 * confirms the stop (see stop-complete/route.js). Photos apply to BOTH
 * pickup and dropoff, unlike signatures.
 */
export async function POST(request, { params }) {
  try {
    const { driverId } = await params
    const { userId } = await requireDriver()
    if (driverId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file      = formData.get('file')
    const bookingId = formData.get('bookingId')
    const stopType  = formData.get('stopType')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }
    if (!bookingId || !ObjectId.isValid(bookingId)) {
      return NextResponse.json({ error: 'A valid bookingId is required' }, { status: 400 })
    }
    if (stopType !== 'pickup' && stopType !== 'dropoff') {
      return NextResponse.json({ error: 'stopType must be "pickup" or "dropoff"' }, { status: 400 })
    }

    // Ownership check: the booking + stop type must actually be a stop on
    // this driver's own active route — same reasoning as signature/route.js.
    const route = await findActiveRoute(driverId)
    const ownsStop = route?.optimizedStops?.some(
      (s) => s.bookingId && String(s.bookingId) === String(bookingId) && s.stopType === stopType
    )
    if (!ownsStop) {
      return NextResponse.json({ error: 'Booking stop is not on your active route' }, { status: 403 })
    }

    // NOTE: the MAX_PHOTOS_PER_STOP cap is NOT enforced here. Photos stage
    // locally in the driver's browser (see route/page.js's photosByStop) and
    // are only uploaded one at a time when Confirm is tapped — each upload
    // is a stateless call with no knowledge of how many sibling photos are
    // in the same batch, so counting "already durably saved photos" at this
    // point would check the wrong thing (nothing is durable yet) and never
    // actually block a batch of >3 uploads. The real, effective enforcement
    // is in stop-complete/route.js, which truncates the final photoKeys
    // list to MAX_PHOTOS_PER_STOP right before it becomes durable — the
    // client-side cap in handlePhotoCapture is what prevents this from
    // being reached under normal use.
    const buffer = Buffer.from(await file.arrayBuffer())
    const key = await uploadDeliveryPhoto(buffer, file.type, { driverId, bookingId, stopType })
    return NextResponse.json({ key })
  } catch (err) {
    return handleApiError(err, '[POST /api/drivers/[driverId]/photos]')
  }
}

/**
 * DELETE /api/drivers/[driverId]/photos
 * Body: { key: string }
 *
 * Cleanup for: (a) driver removes a staged photo before confirming, (b)
 * stop-complete hard-fails after upload, leaving an orphaned object. Same
 * key-ownership guard as signature/route.js's DELETE.
 */
export async function DELETE(request, { params }) {
  try {
    const { driverId } = await params
    const { userId } = await requireDriver()
    if (driverId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { key } = await request.json()
    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key is required' }, { status: 400 })
    }
    if (!key.includes(`-${driverId}-`)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await deleteDeliveryPhoto(key)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, '[DELETE /api/drivers/[driverId]/photos]')
  }
}
