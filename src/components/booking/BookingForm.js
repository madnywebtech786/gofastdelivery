'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import DatePicker from '@/components/ui/DatePicker'
import { useToast } from '@/components/ui/Toast'
import { placesAutocomplete, placeDetails, reverseGeocode } from '@/lib/google-geocode'
import { calculatePrice } from '@/lib/pricing'
import { Plus, Trash2 } from 'lucide-react'

const BookingMap = dynamic(() => import('@/components/map/BookingMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] rounded-xl bg-surface border border-border flex items-center justify-center text-muted text-sm">
      Loading map…
    </div>
  ),
})


const PACKAGE_KINDS = [
  'Small Packages & Boxes',
  'Envelopes / Documents',
  'Packed Food',
  'Medical & Pharmaceutical Supplies',
  'Totes',
  'Gifts & Flowers',
  'Industrial Samples',
  'Other',
]

// Fixed pickup-time slots (client-specified). value stays "HH:mm" (24h) so it
// composes directly into the "YYYY-MM-DDTHH:mm" pickupTime string the API and
// admin pickup-date filter (src/lib/db/bookings.js buildAdminFilter) expect.
const PICKUP_TIME_SLOTS = [
  { value: '08:00', label: '8:00 AM' },
  { value: '08:30', label: '8:30 AM' },
  { value: '09:00', label: '9:00 AM' },
  { value: '09:30', label: '9:30 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '10:30', label: '10:30 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '12:30', label: '12:30 PM' },
  { value: '13:00', label: '1:00 PM' },
  { value: '13:30', label: '1:30 PM' },
  { value: '14:00', label: '2:00 PM' },
  { value: '14:30', label: '2:30 PM' },
  { value: '15:00', label: '3:00 PM' },
  { value: '15:30', label: '3:30 PM' },
  { value: '16:00', label: '4:00 PM' },
  { value: '16:30', label: '4:30 PM' },
]

// react-day-picker Matcher — blocks all Sundays and any day before today.
function isPickupDateDisabled(date) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  return date.getDay() === 0 || date < startOfToday
}

function emptyPackage() {
  return { kind: '', weightLbs: '' }
}

function SectionHeading({ children }) {
  return (
    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mt-2 mb-3 flex items-center gap-2">
      {children}
    </h3>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted mb-1">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-surface'

// Pulls a stop's { lat, lng } out of either shape a booking doc can have —
// stored bookings use stop.coordinates.{lat,lng} (see createBooking), while
// the live map/form state uses flat stop.lat/lng.
function stopLatLng(stop) {
  return { lat: stop?.coordinates?.lat ?? stop?.lat, lng: stop?.coordinates?.lng ?? stop?.lng }
}

export default function BookingForm({ apiPath = '/api/bookings', onSuccess, initialBooking = null }) {
  const router = useRouter()
  const toast  = useToast()
  const mapRef = useRef(null)
  const isEditMode = !!initialBooking
  // failed_dropoff means the package has already been picked up — the driver
  // is already carrying whatever was picked up, so pickup location/details
  // and package contents can no longer be changed at that point; only
  // drop-off info can still be corrected. Server-side enforcement (the real
  // security boundary) lives in PATCH /api/bookings/[bookingId]/edit, which
  // discards any pickup/packageDetails the client sends and re-uses the
  // booking's existing values instead — this UI lock is for a clear,
  // consistent experience, not the source of truth.
  const isPickupLocked = isEditMode && initialBooking.status === 'failed_dropoff'

  const initialPickupStop  = initialBooking?.stops?.find((s) => s.type === 'pickup')  ?? null
  const initialDropoffStop = initialBooking?.stops?.find((s) => s.type === 'dropoff') ?? null

  // Map stops
  const [stops, setStops] = useState([])

  // Pickup details (for the pickup stop card)
  const [pickup, setPickup] = useState({
    contactName:  initialPickupStop?.contactName  ?? '',
    companyName:  initialPickupStop?.companyName  ?? '',
    address:      initialPickupStop?.address      ?? '',
    buzzCode:     initialPickupStop?.buzzCode     ?? '',
    pickupTime:   initialPickupStop?.pickupTime   ?? '',
    contactPhone: initialPickupStop?.contactPhone ?? '',
    notes:        initialPickupStop?.notes        ?? '',
  })

  // Drop-off details (for the dropoff stop card)
  const [dropoff, setDropoff] = useState({
    contactName:  initialDropoffStop?.contactName  ?? '',
    address:      initialDropoffStop?.address      ?? '',
    buzzCode:     initialDropoffStop?.buzzCode     ?? '',
    contactPhone: initialDropoffStop?.contactPhone ?? '',
  })
  // Tracks whether the Address field currently holds an address auto-filled
  // from a "Set Pickup"/"Set Drop-off" click (safe to overwrite on the NEXT
  // click) vs. text the user typed themselves (must never be overwritten by
  // a click). Both start true — field begins empty/un-typed. Buzz/Unit Code
  // is a separate, always-manual, optional field — it has no auto-fill ref.
  const dropoffAddressIsAutoFilledRef = useRef(true)
  const pickupAddressIsAutoFilledRef  = useRef(true)
  // The one-time profile-prefill effect below seeds the pickup pin via
  // setPickupCoords, which fires the SAME onStopsChange callback a real
  // "Set Pickup" click does — there's no way to tell them apart from the
  // callback alone. This flag suppresses handleStopsChange's click-driven
  // auto-fill ONLY while that seed is in flight, so it doesn't immediately
  // overwrite the just-prefilled profile address. A real click always wins
  // once the user makes one, before or after the seed finishes.
  const profileSeedInFlightRef = useRef(false)

  // Prefill pickup details from customer profile if profileUpdated is true.
  // Also geocode the saved address and pre-seed the pickup pin on the map.
  // Skipped in edit mode — the booking already has real, saved stop data
  // (see the pin-seeding effect below), which must win over the profile.
  useEffect(() => {
    if (apiPath !== '/api/bookings') return // guest form — skip
    if (isEditMode) return
    fetch('/api/user/profile')
      .then((r) => r.ok ? r.json() : null)
      .then((user) => {
        if (!user?.profileUpdated) return
        setPickup((prev) => ({
          ...prev,
          contactName:  user.contactName || prev.contactName,
          companyName:  user.companyName || prev.companyName,
          address:      user.address     || prev.address,
          contactPhone: user.phone       || prev.contactPhone,
        }))
        if (user.email) setSenderEmail(user.email)

        // Geocode the saved address and pre-seed the pickup pin
        if (!user.address?.trim()) return

        // Suppress click-driven address auto-fill for the duration of this
        // seed — setPickupCoords below fires onStopsChange just like a real
        // click, but pickup.address was already set to the profile address
        // above and must not be immediately overwritten by that callback.
        profileSeedInFlightRef.current = true

        // Show loading overlay as soon as the map ref is ready, then geocode
        const sessionToken = crypto.randomUUID()
        let attempts = 0
        const tryShowThenGeocode = () => {
          if (mapRef.current?.setPlacing) {
            mapRef.current.setPlacing('pickup')
            placesAutocomplete(user.address, sessionToken)
              .then((predictions) => {
                if (!predictions.length) { mapRef.current?.setPlacing(null); return }
                return placeDetails(predictions[0].placeId, sessionToken)
              })
              .then(async (result) => {
                if (!result) return
                // placeDetails only returns { lng, lat } — reverse-geocode the
                // same point to resolve `city`, exactly like a manual map
                // click does (BookingMap.js's handlePlace), so the profile-
                // prefilled pickup pin can price itself like any other pin.
                const { city } = await reverseGeocode(result.lng, result.lat)
                mapRef.current?.setPickupCoords(result.lng, result.lat, result.address, city)
              })
              .catch(() => { mapRef.current?.setPlacing(null) })
              .finally(() => { profileSeedInFlightRef.current = false })
          } else if (attempts < 20) {
            attempts++
            setTimeout(tryShowThenGeocode, 300)
          } else {
            profileSeedInFlightRef.current = false
          }
        }
        tryShowThenGeocode()
      })
      .catch(() => {})
  }, [apiPath, isEditMode])

  // Edit mode: seed both pins from the booking's already-known coordinates.
  // Stored stops don't persist `city` (only used transiently at creation to
  // price the booking — see POST /api/bookings), so it's re-resolved here via
  // reverseGeocode using the real saved coordinates (no Places Autocomplete
  // round-trip needed, unlike profile-prefill which only has text to start
  // from). Retries briefly until the map ref is ready, then fits the
  // viewport to both pins.
  useEffect(() => {
    if (!isEditMode || !initialPickupStop || !initialDropoffStop) return
    const pickupLL  = stopLatLng(initialPickupStop)
    const dropoffLL = stopLatLng(initialDropoffStop)
    if (!Number.isFinite(pickupLL.lat) || !Number.isFinite(dropoffLL.lat)) return

    let attempts = 0
    let cancelled = false
    let overlayShown = false
    const trySeed = async () => {
      if (cancelled) return
      if (mapRef.current?.setPickupCoords && mapRef.current?.setDropoffCoords) {
        // Show a loading overlay on the map while both pins are resolved —
        // otherwise the map just sits empty during the reverse-geocode calls
        // below, with no indication the booking is being pre-filled.
        mapRef.current.setPlacing?.('loading')
        overlayShown = true
        try {
          const [pickupGeo, dropoffGeo] = await Promise.all([
            reverseGeocode(pickupLL.lng, pickupLL.lat),
            reverseGeocode(dropoffLL.lng, dropoffLL.lat),
          ])
          if (cancelled) return
          mapRef.current.setPickupCoords(pickupLL.lng, pickupLL.lat, initialPickupStop.address, pickupGeo.city)
          mapRef.current.setDropoffCoords(dropoffLL.lng, dropoffLL.lat, initialDropoffStop.address, dropoffGeo.city)
          mapRef.current.fitToStops?.()
        } finally {
          // setPickupCoords/setDropoffCoords already clear placing on success
          // (mirrors setPlacing(null) at the end of each) — only need to
          // force-clear here on the cancelled/thrown path so it never sticks.
          if (cancelled && overlayShown) mapRef.current?.setPlacing?.(null)
        }
      } else if (attempts < 20) {
        attempts++
        setTimeout(trySeed, 300)
      }
    }
    trySeed()
    return () => {
      cancelled = true
      if (overlayShown) mapRef.current?.setPlacing?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once on mount only
  }, [isEditMode])

  // Package details — one or more packages, each with its own kind + weight.
  const [packages, setPackages] = useState(
    initialBooking?.packageDetails?.packages?.length > 0
      ? initialBooking.packageDetails.packages.map((p) => ({ kind: p.kind ?? '', weightLbs: p.weightLbs ?? '' }))
      : initialBooking?.packageDetails?.kind
        ? [{ kind: initialBooking.packageDetails.kind, weightLbs: initialBooking.packageDetails.weightLbs ?? '' }]
        : [emptyPackage()]
  )
  // One error string per package (by index), shown at the bottom of that
  // package's own card — cleared for a package as soon as the user fixes it.
  const [packageErrors, setPackageErrors] = useState([])

  function validatePackage(p) {
    if (!p.kind) return 'Please select a kind of package.'
    if (!p.weightLbs || Number(p.weightLbs) <= 0) return 'Please enter a weight greater than 0.'
    return null
  }

  function handlePackageChange(index, field, value) {
    setPackages((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
    // Re-validate just this package as the user edits it, so a fixed field
    // clears its own error immediately instead of waiting for next submit.
    setPackageErrors((prev) => {
      if (!prev[index]) return prev
      const updated = { ...packages[index], [field]: value }
      const next = [...prev]
      next[index] = validatePackage(updated)
      return next
    })
  }

  function handleAddPackage() {
    setPackages((prev) => [...prev, emptyPackage()])
  }

  function handleRemovePackage(index) {
    setPackages((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
    setPackageErrors((prev) => prev.filter((_, i) => i !== index))
  }

  // Sender + receiver notification emails
  const [senderEmail,   setSenderEmail]   = useState(initialBooking?.senderEmail   ?? '')
  const [receiverEmail, setReceiverEmail] = useState(initialBooking?.receiverEmail ?? '')

  // Pricing data fetched once on mount — { cities, rules, settings }, fed
  // straight into calculatePrice() (src/lib/pricing.js) with zero extra calls.
  // Must be state, not a ref: the price-preview effect below depends on
  // [stops, packages] only, so if this were a ref the fetch resolving after
  // the user has already placed both pins would never re-trigger the price
  // calculation — the section would stay hidden until some unrelated change
  // (e.g. editing package weight) happened to re-run the effect.
  const [pricingData, setPricingData] = useState(null) // null = not loaded yet (or failed)

  // Pricing preview — computed client-side from pricingData, no extra API calls
  const [pricingPreview, setPricingPreview] = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const hasPickup  = stops.some((s) => s.type === 'pickup')
  const hasDropoff = stops.some((s) => s.type === 'dropoff')

  // If the selected pickup date is today, hide time slots that have already
  // passed (mirrors the previous datetime-local input's `min={now+1min}`).
  const pickupDatePart = pickup.pickupTime.split('T')[0] || ''
  const availableTimeSlots = (() => {
    const todayStr = new Date().toLocaleDateString('en-CA') // 'YYYY-MM-DD', local time
    if (pickupDatePart !== todayStr) return PICKUP_TIME_SLOTS
    const nowHHMM = new Date(Date.now() + 60000).toTimeString().slice(0, 5)
    return PICKUP_TIME_SLOTS.filter((slot) => slot.value > nowHHMM)
  })()

  // Fetch cities/rules/settings once on mount
  useEffect(() => {
    fetch('/api/pricing/rules/public')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { setPricingData(data) })
      .catch(() => { setPricingData(null) })
  }, [])

  const handleStopsChange = useCallback((newStops) => {
    setStops(newStops)
    const pickupStop  = newStops.find((s) => s.type === 'pickup')
    const dropoffStop = newStops.find((s) => s.type === 'dropoff')
    // Fires only when the user clicks "Set Pickup"/"Set Drop-off" (or re-
    // clicks after moving the pin) — BookingMap's onStopsChange is driven
    // exclusively by those clicks (and the one-time profile seed, suppressed
    // below), never by panning alone. Auto-fill only while the field still
    // holds an auto-filled value; once the user types into it directly, the
    // onChange handlers below flip the ref and this stops touching it.
    if (dropoffStop?.address && dropoffAddressIsAutoFilledRef.current) {
      setDropoff((prev) => ({ ...prev, address: dropoffStop.address }))
    }
    if (pickupStop?.address && pickupAddressIsAutoFilledRef.current && !profileSeedInFlightRef.current) {
      setPickup((prev) => ({ ...prev, address: pickupStop.address }))
    }
  }, [])

  function handleDeleteStop(index) {
    mapRef.current?.removeStop(index)
  }

  // Client-side price preview — runs whenever stops or packages change, zero
  // extra API calls (uses the cities/rules/settings fetched once on mount).
  useEffect(() => {
    const pickupStop  = stops.find((s) => s.type === 'pickup')
    const dropoffStop = stops.find((s) => s.type === 'dropoff')

    if (!pickupStop?.city || !dropoffStop?.city || !pricingData) {
      setPricingPreview(null)
      return
    }

    const { cities, rules, settings } = pricingData
    const result = calculatePrice({
      fromCityName: pickupStop.city,
      toCityName: dropoffStop.city,
      packages,
      cities, rules, settings,
    })

    setPricingPreview(
      result ? { price: result.total, maxWeightLbs: settings?.maxWeightLbs ?? 20, ...result.breakdown } : null
    )
  }, [stops, packages, pricingData])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!hasPickup || !hasDropoff) {
      setError('Place a pickup point and a drop-off point on the map.')
      return
    }
    if (!pickup.pickupTime.split('T')[0]) {
      setError('Pickup date is required.')
      return
    }
    if (!pickup.pickupTime.split('T')[1]) {
      setError('Pickup time is required.')
      return
    }
    if (!pickup.address.trim()) {
      setError('Pickup address is required.')
      return
    }
    if (!pickup.contactPhone.trim()) {
      setError('Pickup phone number is required.')
      return
    }
    if (!dropoff.address.trim()) {
      setError('Drop-off address is required.')
      return
    }
    if (!dropoff.contactPhone.trim()) {
      setError('Drop-off phone number is required.')
      return
    }
    const nextPackageErrors = packages.map(validatePackage)
    if (nextPackageErrors.some(Boolean)) {
      setPackageErrors(nextPackageErrors)
      setError('Fix the package details highlighted below.')
      return
    }

    // Same-location guard: block only when pickup and dropoff coordinates are
    // within ~25 m of each other (essentially the same pin). Address text is
    // unreliable for this — reverse-geocoded labels can be identical in rural
    // areas even for points that are hundreds of metres apart.
    const p = stops.find((s) => s.type === 'pickup')
    const d = stops.find((s) => s.type === 'dropoff')
    if (p && d) {
      const R = 6_371_000 // metres
      const toRad = (x) => (x * Math.PI) / 180
      const dLat = toRad(d.lat - p.lat)
      const dLng = toRad(d.lng - p.lng)
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(p.lat)) * Math.cos(toRad(d.lat)) * Math.sin(dLng / 2) ** 2
      const distanceMeters = 2 * R * Math.asin(Math.sqrt(a))
      if (distanceMeters < 25) {
        toast.warning(
          'Pickup and drop-off are at the same location',
          'Please choose two different points on the map.'
        )
        return
      }
    }

    setSubmitting(true)
    try {
      const pickupStop  = stops.find((s) => s.type === 'pickup')
      const dropoffStop = stops.find((s) => s.type === 'dropoff')

      const payload = {
        stops: [
          {
            type: 'pickup',
            order: 0,
            lat: pickupStop.lat,
            lng: pickupStop.lng,
            address: pickup.address || pickupStop.address,
            city: pickupStop.city,
            contactName: pickup.contactName,
            companyName: pickup.companyName,
            buzzCode: pickup.buzzCode,
            pickupTime: pickup.pickupTime,
            contactPhone: pickup.contactPhone,
            notes: pickup.notes,
          },
          {
            type: 'dropoff',
            order: 1,
            lat: dropoffStop.lat,
            lng: dropoffStop.lng,
            address: dropoff.address || dropoffStop.address,
            city: dropoffStop.city,
            contactName: dropoff.contactName,
            buzzCode: dropoff.buzzCode,
            contactPhone: dropoff.contactPhone,
          },
        ],
        packageDetails: {
          packages: packages.map((p) => ({ kind: p.kind, weightLbs: Number(p.weightLbs) || 0, quantity: 1 })),
        },
        senderEmail:   senderEmail   || null,
        receiverEmail: receiverEmail || null,
        estimatedPrice: pricingPreview?.price ?? null,
      }

      const url    = isEditMode ? `/api/bookings/${initialBooking._id}/edit` : apiPath
      const method = isEditMode ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        const msg = data.error || (isEditMode ? 'Failed to update booking. Please try again.' : 'Failed to create booking. Please try again.')
        setError(msg)
        toast.error(isEditMode ? 'Could not save changes' : 'Could not create booking', msg)
        return
      }

      if (isEditMode) {
        // Silent update — no re-send of confirmation email/SMS. Navigate back
        // to the detail page, which re-fetches the now-updated booking.
        toast.success('Booking updated', 'Your changes have been saved.')
        router.push(`/customer/my-bookings/${initialBooking._id}`)
        router.refresh()
        return
      }

      // Reset all state
      mapRef.current?.clearAll()
      setStops([])
      setPickup({ contactName: '', companyName: '', address: '', buzzCode: '', pickupTime: '', contactPhone: '', notes: '' })
      setDropoff({ contactName: '', address: '', buzzCode: '', contactPhone: '' })
      dropoffAddressIsAutoFilledRef.current = true
      pickupAddressIsAutoFilledRef.current = true
      setPackages([emptyPackage()])
      setPackageErrors([])
      setSenderEmail('')
      setReceiverEmail('')
      setPricingPreview(null)

      if (onSuccess) {
        // Guest flow — delegate navigation/toast to the parent page
        onSuccess(data)
      } else {
        // Customer portal flow — store ID for MyBookingsClient refresh then navigate
        if (data._id) sessionStorage.setItem('newBookingId', data._id)
        const trackShort = data.trackingToken ? `Tracking #${data.trackingToken}` : ''
        toast.success(
          'Booking created',
          trackShort ? `${trackShort} — we'll notify you at every status change.` : `We'll notify you at every status change.`
        )
        router.push('/customer/my-bookings')
        router.refresh()
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Map ──────────────────────────────────────────────────────────── */}
      <div>
        <SectionHeading>📍 Set Pickup &amp; Drop-off on Map</SectionHeading>
        <div className="h-[420px]">
          <BookingMap ref={mapRef} onStopsChange={handleStopsChange} lockPickup={isPickupLocked} />
        </div>
        {/* Address confirmation pills */}
        {stops.length > 0 && (
          <div className="mt-6 space-y-1.5">
            {stops.map((stop, i) => (
              <div key={stop.type} className="flex items-center gap-2 text-xs">
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: i === 0 ? '#16a34a' : '#dc2626' }}
                >
                  {i === 0 ? 'P' : 'D'}
                </span>
                <span className="font-medium text-foreground capitalize">{stop.type}</span>
                <span className="text-muted truncate flex-1">{stop.address}</span>
                {!(isPickupLocked && stop.type === 'pickup') && (
                  <button
                    type="button"
                    onClick={() => handleDeleteStop(i)}
                    className="text-danger hover:text-red-700 font-medium shrink-0"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pickup Details ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
        <SectionHeading>
          📦 Pickup Details
          {isPickupLocked && (
            <span className="text-[11px] font-semibold normal-case tracking-normal px-2 py-0.5 rounded-full" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              Locked — already picked up
            </span>
          )}
        </SectionHeading>
        {isPickupLocked && (
          <p className="text-xs text-muted -mt-2">
            This package has already been picked up, so pickup details and package contents can't be changed. You can still update the drop-off information below.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact Name">
            <input type="text" value={pickup.contactName} onChange={(e) => setPickup((p) => ({ ...p, contactName: e.target.value }))} className={inputCls} placeholder="John Smith" disabled={isPickupLocked} />
          </Field>
          <Field label="Company Name">
            <input type="text" value={pickup.companyName} onChange={(e) => setPickup((p) => ({ ...p, companyName: e.target.value }))} className={inputCls} placeholder="ABC Corp (optional)" disabled={isPickupLocked} />
          </Field>
          <Field label="Address" required>
            <input
              type="text"
              value={pickup.address}
              onChange={(e) => {
                pickupAddressIsAutoFilledRef.current = false
                setPickup((p) => ({ ...p, address: e.target.value }))
              }}
              className={inputCls}
              placeholder="123 Main St, Calgary, AB"
              required
              disabled={isPickupLocked}
            />
          </Field>
          <Field label="Buzz / Unit Code">
            <input
              type="text"
              value={pickup.buzzCode}
              onChange={(e) => setPickup((p) => ({ ...p, buzzCode: e.target.value }))}
              className={inputCls}
              placeholder="#4B, buzz 1234 (optional)"
              disabled={isPickupLocked}
            />
          </Field>
          <Field label="Pickup Date" required>
            <DatePicker
              value={pickup.pickupTime.split('T')[0] || ''}
              onChange={(dateStr) =>
                setPickup((p) => ({ ...p, pickupTime: dateStr ? `${dateStr}T${p.pickupTime.split('T')[1] || ''}` : '' }))
              }
              disabledDays={isPickupDateDisabled}
              placeholder="Select a date"
              required
              disabled={isPickupLocked}
            />
          </Field>
          <Field label="Pickup Time" required>
            <Select
              value={pickup.pickupTime.split('T')[1] || ''}
              onChange={(timeStr) =>
                setPickup((p) => ({ ...p, pickupTime: p.pickupTime.split('T')[0] ? `${p.pickupTime.split('T')[0]}T${timeStr}` : '' }))
              }
              options={availableTimeSlots}
              placeholder="Select a time"
              disabled={isPickupLocked || !pickup.pickupTime.split('T')[0]}
              required
            />
          </Field>
          <Field label="Phone Number" required>
            <input type="tel" value={pickup.contactPhone} onChange={(e) => setPickup((p) => ({ ...p, contactPhone: e.target.value }))} className={inputCls} placeholder="+1 403-000-0000" required disabled={isPickupLocked} />
          </Field>
          <Field label="Your Email (for booking confirmation &amp; updates)">
            <input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} className={inputCls} placeholder="you@example.com" disabled={isPickupLocked} />
          </Field>
        </div>
        <Field label="Description / Notes">
          <textarea value={pickup.notes} onChange={(e) => setPickup((p) => ({ ...p, notes: e.target.value }))} className={inputCls} rows={3} placeholder="Gate code, leave at front desk, etc." disabled={isPickupLocked} />
        </Field>
      </div>

      {/* ── Drop-off Details ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
        <SectionHeading>🏁 Drop-off Details</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Receiver Name">
            <input type="text" value={dropoff.contactName} onChange={(e) => setDropoff((p) => ({ ...p, contactName: e.target.value }))} className={inputCls} placeholder="Jane Doe" />
          </Field>
          <Field label="Address" required>
            <input
              type="text"
              value={dropoff.address}
              onChange={(e) => {
                dropoffAddressIsAutoFilledRef.current = false
                setDropoff((p) => ({ ...p, address: e.target.value }))
              }}
              className={inputCls}
              placeholder="123 Main St, Calgary, AB"
              required
            />
          </Field>
          <Field label="Buzz / Unit Code">
            <input
              type="text"
              value={dropoff.buzzCode}
              onChange={(e) => setDropoff((p) => ({ ...p, buzzCode: e.target.value }))}
              className={inputCls}
              placeholder="#2A, buzz 5678 (optional)"
            />
          </Field>
          <Field label="Phone Number (for status notifications)" required>
            <input type="tel" value={dropoff.contactPhone} onChange={(e) => setDropoff((p) => ({ ...p, contactPhone: e.target.value }))} className={inputCls} placeholder="+1 403-000-0000" required />
          </Field>
        </div>
        <Field label="Receiver Email">
          <input type="email" value={receiverEmail} onChange={(e) => setReceiverEmail(e.target.value)} className={inputCls} placeholder="receiver@example.com" />
        </Field>
      </div>

      {/* ── Package Details ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
        <SectionHeading>
          📋 Package Details
          {isPickupLocked && (
            <span className="text-[11px] font-semibold normal-case tracking-normal px-2 py-0.5 rounded-full" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              Locked — already picked up
            </span>
          )}
        </SectionHeading>
        <div className="space-y-3">
          {packages.map((p, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">Package {i + 1}</span>
                {packages.length > 1 && !isPickupLocked && (
                  <button
                    type="button"
                    onClick={() => handleRemovePackage(i)}
                    className="text-danger hover:text-red-700 shrink-0"
                    aria-label={`Remove package ${i + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Kind of Package"
                  placeholder="Select type…"
                  value={p.kind}
                  onChange={(v) => handlePackageChange(i, 'kind', v)}
                  options={PACKAGE_KINDS.map((k) => ({ value: k, label: k }))}
                  disabled={isPickupLocked}
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide select-none" style={{ color: '#64748b' }}>
                    Weight (lbs)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={p.weightLbs}
                    onChange={(e) => handlePackageChange(i, 'weightLbs', e.target.value)}
                    disabled={isPickupLocked}
                    className="w-full rounded-xl border px-3.5 py-2.5 text-sm transition-all duration-150 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-surface"
                    style={{
                      borderColor: packageErrors[i] ? 'var(--danger)' : 'var(--border-2)',
                      color: 'var(--fg)',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)' }}
                    onBlur={(e) => { e.target.style.borderColor = packageErrors[i] ? 'var(--danger)' : 'var(--border-2)'; e.target.style.boxShadow = 'none' }}
                    placeholder="e.g. 12"
                  />
                </div>
              </div>
              {packageErrors[i] && (
                <p className="text-xs font-medium" style={{ color: 'var(--danger)' }}>{packageErrors[i]}</p>
              )}
            </div>
          ))}
        </div>
        {!isPickupLocked && (
          <button
            type="button"
            onClick={handleAddPackage}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Plus size={14} /> Add Package
          </button>
        )}
      </div>

      {/* ── Pricing Preview — shown once both cities are known ───────────── */}
      {hasPickup && hasDropoff && stops.find((s) => s.type === 'pickup')?.city && stops.find((s) => s.type === 'dropoff')?.city && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <SectionHeading>💰 Estimated Price</SectionHeading>
          {pricingPreview ? (
            <div className="space-y-3">
              <p className="text-xs text-muted">{pricingPreview.routeLabel}</p>

              <div className="rounded-lg border border-border bg-white dark:bg-surface divide-y divide-border text-sm">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-muted">Base rate (1st package)</span>
                  <span className="font-medium text-foreground">${pricingPreview.baseRate.toFixed(2)}</span>
                </div>
                {pricingPreview.hubFee > 0 && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-muted">Calgary hub handling fee</span>
                    <span className="font-medium text-foreground">${pricingPreview.hubFee.toFixed(2)}</span>
                  </div>
                )}
                {pricingPreview.packageCount > 1 && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-muted">
                      Additional packages ({pricingPreview.packageCount - 1} × ${(pricingPreview.additionalPackagesTotal / (pricingPreview.packageCount - 1)).toFixed(2)})
                    </span>
                    <span className="font-medium text-foreground">${pricingPreview.additionalPackagesTotal.toFixed(2)}</span>
                  </div>
                )}
                {pricingPreview.overweightCount > 0 && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-muted">
                      Overweight surcharge ({pricingPreview.overweightCount} pkg over {pricingPreview.maxWeightLbs} lb)
                    </span>
                    <span className="font-medium text-foreground">${pricingPreview.overweightTotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                  <span className="text-sm font-bold text-foreground">Total</span>
                  <p className="text-xl font-bold text-foreground">
                    ${pricingPreview.price.toFixed(2)}
                    <span className="text-xs text-muted font-normal ml-1">CAD</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No rate configured for this route yet.</p>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-danger bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <Button
        type="submit"
        loading={submitting}
        disabled={!hasPickup || !hasDropoff}
        className="w-full"
      >
        {isEditMode ? 'Save Changes' : 'Create Booking'}
      </Button>
    </form>
  )
}
