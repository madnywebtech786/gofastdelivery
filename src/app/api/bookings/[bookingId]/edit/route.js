import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { verifySession, handleApiError } from '@/lib/dal'
import { updateBookingDetails, findBookingById, CUSTOMER_EDITABLE_STATUSES } from '@/lib/db/bookings'
import { calculatePrice } from '@/lib/pricing'
import { getAllCities, getAllPricingRules, getPricingSettings } from '@/lib/db/pricing'

// Service area bounding box — Greater Alberta / Western Canada (mirrors POST /api/bookings)
const LAT_MIN =  48.0
const LAT_MAX =  60.0
const LNG_MIN = -120.0
const LNG_MAX = -110.0
const MAX_STRING = 300

function sanitizeStr(val, max = MAX_STRING) {
  if (val == null) return ''
  return String(val).trim().slice(0, max)
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Wrap a longitude into [-180, 180] — see POST /api/bookings for why.
function normalizeLng(lng) {
  const n = Number(lng)
  if (!Number.isFinite(n)) return n
  return ((n + 180) % 360 + 360) % 360 - 180
}

function validateStop(stop, label) {
  if (typeof stop.lat !== 'number' || typeof stop.lng !== 'number' || !isFinite(stop.lat) || !isFinite(stop.lng)) {
    return `${label}: coordinates must be numbers`
  }
  if (stop.lat < LAT_MIN || stop.lat > LAT_MAX || stop.lng < LNG_MIN || stop.lng > LNG_MAX) {
    return `${label}: coordinates are outside the service area`
  }
  return null
}

// Mirrors POST /api/bookings' validatePackages — the client already checks
// this, but a direct API call bypasses the client entirely.
function validatePackages(packageDetails) {
  const packages = Array.isArray(packageDetails?.packages) && packageDetails.packages.length > 0
    ? packageDetails.packages
    : [packageDetails]
  for (let i = 0; i < packages.length; i++) {
    const p = packages[i] ?? {}
    if (!sanitizeStr(p.kind)) {
      return `Package ${i + 1}: kind of package is required`
    }
    if (!(Number(p.weightLbs) > 0)) {
      return `Package ${i + 1}: weight must be greater than 0`
    }
  }
  return null
}

/**
 * PATCH /api/bookings/[bookingId]/edit
 *
 * Lets a customer edit their own booking's stops/package/notification-email
 * details — distinct from PATCH /api/bookings/[bookingId], which is the
 * admin/driver status-transition endpoint. Only allowed while the booking is
 * still in CUSTOMER_EDITABLE_STATUSES (pending, failed_pickup, failed_dropoff)
 * — enforced both here (for a clean 409) and again in the Mongo filter inside
 * updateBookingDetails (so a race with a status change can't silently apply
 * a stale edit).
 */
export async function PATCH(request, { params }) {
  try {
    const { bookingId } = await params
    const { userId, role } = await verifySession()
    if (role !== 'customer') {
      return NextResponse.json({ error: 'Only customers can edit their own bookings' }, { status: 403 })
    }

    const existing = await findBookingById(bookingId, { customerId: userId })
    if (!existing) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    if (!CUSTOMER_EDITABLE_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { error: 'This booking can no longer be edited — it has already been assigned or completed.' },
        { status: 409 }
      )
    }

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { stops, senderEmail, receiverEmail } = body
    let { packageDetails } = body

    if (!Array.isArray(stops) || stops.length !== 2) {
      return NextResponse.json(
        { error: 'Exactly 2 stops are required: one pickup and one drop-off' },
        { status: 400 }
      )
    }

    let pickup  = stops.find((s) => s?.type === 'pickup')
    const dropoff = stops.find((s) => s?.type === 'dropoff')
    if (!pickup || !dropoff) {
      return NextResponse.json(
        { error: 'Booking must have exactly 1 pickup and 1 drop-off stop' },
        { status: 400 }
      )
    }

    // failed_dropoff means the package has already been picked up — the
    // pickup location/details and package contents are frozen at that point
    // (the driver is already carrying whatever was picked up), only drop-off
    // info can still be corrected. Discard whatever the client sent for
    // pickup/packageDetails and use the booking's own existing values instead
    // — this can't be bypassed by calling the API directly, unlike a
    // UI-only disabled-field guard.
    if (existing.status === 'failed_dropoff') {
      const existingPickup = existing.stops?.find((s) => s.type === 'pickup')
      pickup = {
        type: 'pickup',
        lat: existingPickup?.coordinates?.lat,
        lng: existingPickup?.coordinates?.lng,
        // city is persisted on stops going forward (see POST /api/bookings
        // and the normalizedStops mapping below) specifically so this branch
        // never needs a live reverse-geocode call. A booking created before
        // that change simply won't have it — calculatePrice() below already
        // returns null gracefully when a city is missing/unrecognized, same
        // as any other unpriced route.
        city: existingPickup?.city,
        address: existingPickup?.address,
        contactName: existingPickup?.contactName,
        companyName: existingPickup?.companyName,
        postalCode: existingPickup?.postalCode,
        buzzCode: existingPickup?.buzzCode,
        pickupTime: existingPickup?.pickupTime,
        contactPhone: existingPickup?.contactPhone,
        notes: existingPickup?.notes,
      }
      packageDetails = existing.packageDetails
    }

    pickup.lng  = normalizeLng(pickup.lng)
    dropoff.lng = normalizeLng(dropoff.lng)

    const pickupErr = validateStop(pickup, 'Pickup')
    if (pickupErr) return NextResponse.json({ error: pickupErr }, { status: 400 })
    const dropoffErr = validateStop(dropoff, 'Drop-off')
    if (dropoffErr) return NextResponse.json({ error: dropoffErr }, { status: 400 })
    if (!sanitizeStr(pickup.pickupTime)) {
      return NextResponse.json({ error: 'Pickup time is required' }, { status: 400 })
    }

    // Same-location guard (25m minimum separation) — mirrors POST /api/bookings
    const R = 6_371_000
    const toRad = (x) => (x * Math.PI) / 180
    const dLat = toRad(dropoff.lat - pickup.lat)
    const dLng = toRad(dropoff.lng - pickup.lng)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(pickup.lat)) * Math.cos(toRad(dropoff.lat)) * Math.sin(dLng / 2) ** 2
    if (2 * R * Math.asin(Math.sqrt(a)) < 25) {
      return NextResponse.json(
        { error: 'Pickup and drop-off cannot be at the same location' },
        { status: 400 }
      )
    }

    const cleanSenderEmail   = sanitizeStr(senderEmail)
    const cleanReceiverEmail = sanitizeStr(receiverEmail)
    if (cleanSenderEmail   && !isValidEmail(cleanSenderEmail))   return NextResponse.json({ error: 'Invalid sender email'   }, { status: 400 })
    if (cleanReceiverEmail && !isValidEmail(cleanReceiverEmail)) return NextResponse.json({ error: 'Invalid receiver email' }, { status: 400 })

    const packagesErr = validatePackages(packageDetails)
    if (packagesErr) return NextResponse.json({ error: packagesErr }, { status: 400 })

    // Server-side authoritative price recompute — same as booking creation,
    // never trust a client-sent estimate.
    const packagesForPricing = Array.isArray(packageDetails?.packages) && packageDetails.packages.length > 0
      ? packageDetails.packages
      : [{ weightLbs: packageDetails?.weightLbs }]
    const [cities, rules, settings] = await Promise.all([
      getAllCities(),
      getAllPricingRules(),
      getPricingSettings(),
    ])
    const priceResult = calculatePrice({
      fromCityName: pickup.city,
      toCityName: dropoff.city,
      packages: packagesForPricing,
      cities, rules, settings,
    })
    const price = priceResult?.total ?? null

    const normalizedStops = [pickup, dropoff].map((s, i) => ({
      type:         i === 0 ? 'pickup' : 'dropoff',
      order:        i,
      address:      sanitizeStr(s.address) || `${s.lat}, ${s.lng}`,
      coordinates:  { lat: s.lat, lng: s.lng },
      // Persisted (not just used transiently for pricing) so a later
      // failed_dropoff edit can re-derive the frozen pickup's city without
      // an extra reverse-geocode call — see the failed_dropoff branch above.
      city:         sanitizeStr(s.city) || null,
      contactName:  sanitizeStr(s.contactName),
      companyName:  sanitizeStr(s.companyName),
      postalCode:   sanitizeStr(s.postalCode),
      buzzCode:     sanitizeStr(s.buzzCode),
      pickupTime:   sanitizeStr(s.pickupTime) || null,
      contactPhone: sanitizeStr(s.contactPhone),
      notes:        sanitizeStr(s.notes),
      // Preserve completedAt from the existing stop (edit can't happen once a
      // stop is complete anyway, given the status gate above, but stay safe).
      completedAt:  existing.stops?.[i]?.completedAt ?? null,
    }))

    const result = await updateBookingDetails(bookingId, userId, {
      stops: normalizedStops,
      packageDetails,
      senderEmail:    cleanSenderEmail   || null,
      receiverEmail:  cleanReceiverEmail || null,
      estimatedPrice: price,
    })

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'This booking can no longer be edited — it has already been assigned or completed.' },
        { status: 409 }
      )
    }

    // Cache Components (next.config.mjs) preserves recently-visited routes in
    // a hidden client Activity boundary instead of unmounting them — router.
    // refresh() on the page we navigate TO after a successful edit does not
    // reach the list page if it was already visited earlier in the session
    // and is sitting hidden. revalidatePath marks both server-side so the
    // next time either becomes visible again it refetches instead of
    // resurrecting the stale hidden tree.
    revalidatePath('/customer/my-bookings')
    revalidatePath('/customer/my-bookings/[bookingId]', 'page')

    const updated = await findBookingById(bookingId, { customerId: userId })
    return NextResponse.json(JSON.parse(JSON.stringify(updated)))
  } catch (err) {
    return handleApiError(err, '[PATCH /api/bookings/[bookingId]/edit]')
  }
}
