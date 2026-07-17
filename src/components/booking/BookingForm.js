'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import DatePicker from '@/components/ui/DatePicker'
import { useToast } from '@/components/ui/Toast'
import { placesAutocomplete, placeDetails } from '@/lib/google-geocode'
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

const WEIGHT_SLABS = [
  { label: 'Up to 10 kg', value: 'up_to_10' },
  { label: '10–25 kg (extra package)', value: '10_to_25' },
  { label: '25–50 kg (heavy)', value: '25_to_50' },
  { label: '50+ kg (freight)', value: '50_plus' },
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
  return { kind: '', weightSlab: 'up_to_10' }
}

// Heaviest slab across all packages ("highest slab wins") — WEIGHT_SLABS is
// already ordered lightest → heaviest, so the array index is the rank.
function heaviestWeightSlab(packages) {
  return packages.reduce((heaviest, p) => {
    const rank = WEIGHT_SLABS.findIndex((w) => w.value === p.weightSlab)
    const heaviestRank = WEIGHT_SLABS.findIndex((w) => w.value === heaviest)
    return rank > heaviestRank ? p.weightSlab : heaviest
  }, packages[0]?.weightSlab ?? 'up_to_10')
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
  'w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'

export default function BookingForm({ apiPath = '/api/bookings', onSuccess }) {
  const router = useRouter()
  const toast  = useToast()
  const mapRef = useRef(null)

  // Map stops
  const [stops, setStops] = useState([])

  // Pickup details (for the pickup stop card)
  const [pickup, setPickup] = useState({
    contactName: '',
    companyName: '',
    address: '',
    buzzCode: '',
    pickupTime: '',
    contactPhone: '',
    notes: '',
  })

  // Drop-off details (for the dropoff stop card)
  const [dropoff, setDropoff] = useState({
    contactName: '',
    address: '',
    buzzCode: '',
    contactPhone: '',
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
  useEffect(() => {
    if (apiPath !== '/api/bookings') return // guest form — skip
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
              .then((result) => {
                if (!result) return
                mapRef.current?.setPickupCoords(result.lng, result.lat, result.address, '')
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
  }, [apiPath])

  // Package details — one or more packages, each with its own kind + weight
  // slab. The booking is priced off the heaviest slab across all packages.
  const [packages, setPackages] = useState([emptyPackage()])

  function handlePackageChange(index, field, value) {
    setPackages((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  function handleAddPackage() {
    setPackages((prev) => [...prev, emptyPackage()])
  }

  function handleRemovePackage(index) {
    setPackages((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  // Sender + receiver notification emails
  const [senderEmail,   setSenderEmail]   = useState('')
  const [receiverEmail, setReceiverEmail] = useState('')

  // Pricing rules fetched once on mount — keyed as Map for O(1) lookup
  // rule key: `${fromCity}|${toCity}|${weightSlab}` (all lowercased)
  const pricingRulesRef = useRef(null) // null = not loaded yet, Map after load

  // Pricing preview — computed client-side from pricingRulesRef, no extra API calls
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

  // Fetch all pricing rules once on mount
  useEffect(() => {
    fetch('/api/pricing/rules/public')
      .then((r) => r.ok ? r.json() : [])
      .then((rules) => {
        const map = new Map()
        for (const r of rules) {
          const key = `${r.fromCity}|${r.toCity}|${r.weightSlab}`
          map.set(key, r)
        }
        pricingRulesRef.current = map
      })
      .catch(() => { pricingRulesRef.current = new Map() })
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

  // Client-side price lookup — runs whenever stops or weight changes, zero API calls
  useEffect(() => {
    const pickupStop  = stops.find((s) => s.type === 'pickup')
    const dropoffStop = stops.find((s) => s.type === 'dropoff')

    if (!pickupStop?.city || !dropoffStop?.city || !pricingRulesRef.current) {
      setPricingPreview(null)
      return
    }

    const fromCity = pickupStop.city.toLowerCase()
    const toCity   = dropoffStop.city.toLowerCase()
    const slab     = heaviestWeightSlab(packages)

    const key  = `${fromCity}|${toCity}|${slab}`
    const rule = pricingRulesRef.current.get(key)

    if (!rule) {
      setPricingPreview(null)
      return
    }

    const WEIGHT_LABELS = {
      up_to_10:  'Up to 10 kg',
      '10_to_25': '10–25 kg',
      '25_to_50': '25–50 kg',
      '50_plus':  '50+ kg',
    }

    setPricingPreview({
      price:       rule.price,
      routeLabel:  `${rule.fromCityDisplay} → ${rule.toCityDisplay}`,
      weightLabel: WEIGHT_LABELS[slab] ?? slab,
    })
  }, [stops, packages])

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
            contactName: dropoff.contactName,
            buzzCode: dropoff.buzzCode,
            contactPhone: dropoff.contactPhone,
          },
        ],
        packageDetails: {
          packages: packages.map((p) => ({ kind: p.kind, weightSlab: p.weightSlab, quantity: 1 })),
        },
        senderEmail:   senderEmail   || null,
        receiverEmail: receiverEmail || null,
        estimatedPrice: pricingPreview?.price ?? null,
      }

      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        const msg = data.error || 'Failed to create booking. Please try again.'
        setError(msg)
        toast.error('Could not create booking', msg)
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
          <BookingMap ref={mapRef} onStopsChange={handleStopsChange} />
        </div>
        {/* Address confirmation pills */}
        {stops.length > 0 && (
          <div className="mt-2 space-y-1.5">
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
                <button
                  type="button"
                  onClick={() => handleDeleteStop(i)}
                  className="text-danger hover:text-red-700 font-medium shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pickup Details ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
        <SectionHeading>📦 Pickup Details</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact Name">
            <input type="text" value={pickup.contactName} onChange={(e) => setPickup((p) => ({ ...p, contactName: e.target.value }))} className={inputCls} placeholder="John Smith" />
          </Field>
          <Field label="Company Name">
            <input type="text" value={pickup.companyName} onChange={(e) => setPickup((p) => ({ ...p, companyName: e.target.value }))} className={inputCls} placeholder="ABC Corp (optional)" />
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
            />
          </Field>
          <Field label="Buzz / Unit Code">
            <input
              type="text"
              value={pickup.buzzCode}
              onChange={(e) => setPickup((p) => ({ ...p, buzzCode: e.target.value }))}
              className={inputCls}
              placeholder="#4B, buzz 1234 (optional)"
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
              disabled={!pickup.pickupTime.split('T')[0]}
              required
            />
          </Field>
          <Field label="Phone Number" required>
            <input type="tel" value={pickup.contactPhone} onChange={(e) => setPickup((p) => ({ ...p, contactPhone: e.target.value }))} className={inputCls} placeholder="+1 403-000-0000" required />
          </Field>
          <Field label="Your Email (for booking confirmation &amp; updates)">
            <input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} className={inputCls} placeholder="you@example.com" />
          </Field>
        </div>
        <Field label="Description / Notes">
          <textarea value={pickup.notes} onChange={(e) => setPickup((p) => ({ ...p, notes: e.target.value }))} className={inputCls} rows={3} placeholder="Gate code, leave at front desk, etc." />
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
        <SectionHeading>📋 Package Details</SectionHeading>
        <div className="space-y-3">
          {packages.map((p, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">Package {i + 1}</span>
                {packages.length > 1 && (
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
                />
                <Select
                  label="Weight"
                  value={p.weightSlab}
                  onChange={(v) => handlePackageChange(i, 'weightSlab', v)}
                  options={WEIGHT_SLABS}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={handleAddPackage}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Plus size={14} /> Add Package
        </button>
      </div>

      {/* ── Pricing Preview — shown once both cities are known ───────────── */}
      {hasPickup && hasDropoff && stops.find((s) => s.type === 'pickup')?.city && stops.find((s) => s.type === 'dropoff')?.city && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <SectionHeading>💰 Estimated Price</SectionHeading>
          {pricingPreview ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted">{pricingPreview.routeLabel}</p>
                <p className="text-xs text-muted capitalize">{pricingPreview.weightLabel}</p>
              </div>
              <p className="text-2xl font-bold text-foreground">
                ${pricingPreview.price.toFixed(2)}
                <span className="text-xs text-muted font-normal ml-1">CAD</span>
              </p>
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
        Create Booking
      </Button>
    </form>
  )
}
