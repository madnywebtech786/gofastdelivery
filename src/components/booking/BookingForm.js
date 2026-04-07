'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'

const BookingMap = dynamic(() => import('@/components/map/BookingMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] rounded-xl bg-surface border border-border flex items-center justify-center text-muted text-sm">
      Loading map…
    </div>
  ),
})


const PACKAGE_KINDS = [
  'Documents',
  'Medicine / Medical Supplies',
  'Electronics',
  'Clothing / Apparel',
  'Food / Perishables',
  'Household Items',
  'Fragile / Glassware',
  'Auto Parts',
  'Other',
]

const WEIGHT_SLABS = [
  { label: 'Up to 10 kg', value: 'up_to_10' },
  { label: '10–25 kg (extra package)', value: '10_to_25' },
  { label: '25–50 kg (heavy)', value: '25_to_50' },
  { label: '50+ kg (freight)', value: '50_plus' },
]

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

export default function BookingForm() {
  const router = useRouter()
  const mapRef = useRef(null)

  // Map stops
  const [stops, setStops] = useState([])

  // Pickup details (for the pickup stop card)
  const [pickup, setPickup] = useState({
    contactName: '',
    companyName: '',
    postalCode: '',
    buzzCode: '',
    pickupTime: '',
    contactPhone: '',
    notes: '',
  })

  // Drop-off details (for the dropoff stop card)
  const [dropoff, setDropoff] = useState({
    contactName: '',
    buzzCode: '',
    contactPhone: '',
  })

  // Package details
  const [pkg, setPkg] = useState({
    kind: '',
    description: '',
    weightSlab: 'up_to_10',
    specialInstructions: '',
  })

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
    const slab     = pkg.weightSlab

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
  }, [stops, pkg.weightSlab])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!hasPickup || !hasDropoff) {
      setError('Place a pickup point and a drop-off point on the map.')
      return
    }
    if (!pickup.contactPhone.trim()) {
      setError('Pickup phone number is required.')
      return
    }
    if (!dropoff.contactPhone.trim()) {
      setError('Drop-off phone number is required.')
      return
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
            address: pickupStop.address,
            contactName: pickup.contactName,
            companyName: pickup.companyName,
            postalCode: pickup.postalCode,
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
            address: dropoffStop.address,
            contactName: dropoff.contactName,
            buzzCode: dropoff.buzzCode,
            contactPhone: dropoff.contactPhone,
          },
        ],
        packageDetails: {
          kind: pkg.kind,
          description: pkg.description,
          weightSlab: pkg.weightSlab,
          specialInstructions: pkg.specialInstructions,
        },
        senderEmail:   senderEmail   || null,
        receiverEmail: receiverEmail || null,
        estimatedPrice: pricingPreview?.price ?? null,
      }

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create booking. Please try again.')
        return
      }

      // Reset all state
      mapRef.current?.clearAll()
      setStops([])
      setPickup({ contactName: '', companyName: '', postalCode: '', buzzCode: '', pickupTime: '', contactPhone: '', notes: '' })
      setDropoff({ contactName: '', buzzCode: '', contactPhone: '' })
      setPkg({ kind: '', description: '', weightSlab: 'up_to_10', specialInstructions: '' })
      setSenderEmail('')
      setReceiverEmail('')
      setPricingPreview(null)

      router.push('/my-bookings')
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
          <Field label="Postal / ZIP Code">
            <input type="text" value={pickup.postalCode} onChange={(e) => setPickup((p) => ({ ...p, postalCode: e.target.value }))} className={inputCls} placeholder="T2P 1J9" />
          </Field>
          <Field label="Buzz / Unit Code">
            <input type="text" value={pickup.buzzCode} onChange={(e) => setPickup((p) => ({ ...p, buzzCode: e.target.value }))} className={inputCls} placeholder="#4B, buzz 1234" />
          </Field>
          <Field label="Pickup Time">
            <input type="datetime-local" value={pickup.pickupTime} onChange={(e) => setPickup((p) => ({ ...p, pickupTime: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Phone Number" required>
            <input type="tel" value={pickup.contactPhone} onChange={(e) => setPickup((p) => ({ ...p, contactPhone: e.target.value }))} className={inputCls} placeholder="+1 403-000-0000" required />
          </Field>
        </div>
        <Field label="Description / Notes">
          <input type="text" value={pickup.notes} onChange={(e) => setPickup((p) => ({ ...p, notes: e.target.value }))} className={inputCls} placeholder="Gate code, leave at front desk, etc." />
        </Field>
        <Field label="Your Email (for booking confirmation &amp; updates)">
          <input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} className={inputCls} placeholder="you@example.com" />
        </Field>
      </div>

      {/* ── Drop-off Details ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
        <SectionHeading>🏁 Drop-off Details</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Receiver Name">
            <input type="text" value={dropoff.contactName} onChange={(e) => setDropoff((p) => ({ ...p, contactName: e.target.value }))} className={inputCls} placeholder="Jane Doe" />
          </Field>
          <Field label="Buzz / Unit Code">
            <input type="text" value={dropoff.buzzCode} onChange={(e) => setDropoff((p) => ({ ...p, buzzCode: e.target.value }))} className={inputCls} placeholder="#2A, buzz 5678" />
          </Field>
          <Field label="Phone Number" required>
            <input type="tel" value={dropoff.contactPhone} onChange={(e) => setDropoff((p) => ({ ...p, contactPhone: e.target.value }))} className={inputCls} placeholder="+1 403-000-0000" required />
          </Field>
        </div>
        <Field label="Receiver Email (for status notifications)">
          <input type="email" value={receiverEmail} onChange={(e) => setReceiverEmail(e.target.value)} className={inputCls} placeholder="receiver@example.com" />
        </Field>
      </div>

      {/* ── Package Details ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
        <SectionHeading>📋 Package Details</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind of Package">
            <select value={pkg.kind} onChange={(e) => setPkg((p) => ({ ...p, kind: e.target.value }))} className={inputCls}>
              <option value="">Select type…</option>
              {PACKAGE_KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="Weight">
            <select value={pkg.weightSlab} onChange={(e) => setPkg((p) => ({ ...p, weightSlab: e.target.value }))} className={inputCls}>
              {WEIGHT_SLABS.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Description of Contents">
          <input type="text" value={pkg.description} onChange={(e) => setPkg((p) => ({ ...p, description: e.target.value }))} className={inputCls} placeholder="e.g. prescription medicine, 3 bottles" />
        </Field>
        <Field label="Special Instructions">
          <textarea
            value={pkg.specialInstructions}
            onChange={(e) => setPkg((p) => ({ ...p, specialInstructions: e.target.value }))}
            className={inputCls + ' resize-none'}
            rows={2}
            placeholder="Fragile, keep upright, do not stack, etc."
          />
        </Field>
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
