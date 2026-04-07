import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { verifySession, handleApiError } from '@/lib/dal'
import {
  createBooking,
  findBookingsByCustomer,
  findAllBookings,
} from '@/lib/db/bookings'
import { sendBookingConfirmed } from '@/lib/mailer'

export async function GET(request) {
  try {
    const { userId, role } = await verifySession()
    const { searchParams } = new URL(request.url)

    let bookings
    if (role === 'customer') {
      bookings = await findBookingsByCustomer(userId)
    } else if (role === 'admin') {
      const status = searchParams.get('status') ?? undefined
      const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)
      const skip = parseInt(searchParams.get('skip') ?? '0')
      bookings = await findAllBookings({ status, limit, skip })
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(JSON.parse(JSON.stringify(bookings)))
  } catch (err) {
    return handleApiError(err, '[GET /api/bookings]')
  }
}

export async function POST(request) {
  try {
    const { userId, role } = await verifySession()
    if (role !== 'customer') {
      return NextResponse.json({ error: 'Only customers can create bookings' }, { status: 403 })
    }

    const { stops, packageDetails, senderEmail, receiverEmail, estimatedPrice } = await request.json()

    if (!stops || !Array.isArray(stops) || stops.length !== 2) {
      return NextResponse.json(
        { error: 'Exactly 2 stops are required: one pickup and one drop-off' },
        { status: 400 }
      )
    }

    const pickups  = stops.filter((s) => s.type === 'pickup')
    const dropoffs = stops.filter((s) => s.type === 'dropoff')
    if (pickups.length !== 1 || dropoffs.length !== 1) {
      return NextResponse.json(
        { error: 'Booking must have exactly 1 pickup and 1 drop-off stop' },
        { status: 400 }
      )
    }

    for (const stop of stops) {
      if (typeof stop.lng !== 'number' || typeof stop.lat !== 'number') {
        return NextResponse.json({ error: 'Invalid stop coordinates' }, { status: 400 })
      }
    }

    const trackingToken = nanoid(12)
    const booking = await createBooking({
      customerId: userId,
      stops: stops.map((s, i) => ({
        type: s.type === 'pickup' ? 'pickup' : 'dropoff',
        order: i,
        address: s.address ?? `${s.lat}, ${s.lng}`,
        coordinates: { lat: s.lat, lng: s.lng },
        contactName:  s.contactName  ?? '',
        companyName:  s.companyName  ?? '',
        postalCode:   s.postalCode   ?? '',
        buzzCode:     s.buzzCode     ?? '',
        pickupTime:   s.pickupTime   ?? null,
        contactPhone: s.contactPhone ?? '',
        notes:        s.notes        ?? '',
        completedAt: null,
      })),
      packageDetails:  packageDetails  ?? null,
      trackingToken,
      senderEmail:    senderEmail    || null,
      receiverEmail:  receiverEmail  || null,
      estimatedPrice: estimatedPrice ?? null,
    })

    // Send confirmation emails — fire-and-forget, never block response
    try {
      const base = process.env.APP_BASE_URL ?? 'http://localhost:3000'
      const trackingUrl = `${base}/track/${trackingToken}`
      sendBookingConfirmed({ booking: JSON.parse(JSON.stringify(booking)), trackingUrl })
        .catch((e) => console.error('[mailer] booking confirmed:', e))
    } catch { /* non-fatal */ }

    return NextResponse.json(JSON.parse(JSON.stringify(booking)), { status: 201 })
  } catch (err) {
    return handleApiError(err, '[POST /api/bookings]')
  }
}
