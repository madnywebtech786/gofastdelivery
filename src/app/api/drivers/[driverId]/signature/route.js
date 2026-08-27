import { NextResponse } from 'next/server'
import { requireDriver, handleApiError } from '@/lib/dal'
import { uploadSignature, deleteSignature } from '@/lib/s3'
import { findActiveRoute } from '@/lib/db/drivers'
import { ObjectId } from 'mongodb'

/**
 * POST /api/drivers/[driverId]/signature
 * Body: { dataUrl: string (base64 PNG), bookingId: string }
 *
 * Staging upload only — does NOT touch the booking/route document. The
 * returned key is only persisted once the driver actually confirms the
 * dropoff (see stop-complete/route.js). This lets a driver redo a signature
 * freely before confirming without ever writing a half-finished state to Mongo.
 */
export async function POST(request, { params }) {
  try {
    const { driverId } = await params
    const { userId } = await requireDriver()
    if (driverId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { dataUrl, bookingId } = await request.json()
    if (!dataUrl || !bookingId || !ObjectId.isValid(bookingId)) {
      return NextResponse.json({ error: 'dataUrl and a valid bookingId are required' }, { status: 400 })
    }

    // Ownership check: the booking must actually be a stop on this driver's
    // own active route — prevents a driver uploading against an arbitrary
    // bookingId that isn't theirs to deliver.
    const route = await findActiveRoute(driverId)
    const ownsBooking = route?.optimizedStops?.some(
      (s) => s.bookingId && String(s.bookingId) === String(bookingId)
    )
    if (!ownsBooking) {
      return NextResponse.json({ error: 'Booking is not on your active route' }, { status: 403 })
    }

    const key = await uploadSignature(dataUrl, { driverId, bookingId })
    return NextResponse.json({ key })
  } catch (err) {
    return handleApiError(err, '[POST /api/drivers/[driverId]/signature]')
  }
}

/**
 * DELETE /api/drivers/[driverId]/signature
 * Body: { key: string }
 *
 * Cleanup for: (a) driver redoes a signature before confirming (old key
 * discarded), (b) stop-complete hard-fails after upload, leaving an orphaned
 * object. No ownership check beyond the key's own driverId-scoped naming
 * (uploadSignature embeds driverId in the key) — a driver can only ever
 * hold a key that was returned to them from their own POST above.
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
    // The key must contain this driver's own id segment (see uploadSignature's
    // `${driverId}-${uuid}.png` naming) — cheap guard against deleting another
    // driver's object via a guessed/leaked key.
    if (!key.includes(`/${driverId}-`)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await deleteSignature(key)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, '[DELETE /api/drivers/[driverId]/signature]')
  }
}
