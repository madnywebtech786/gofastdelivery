'use client'

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'

const PICKUP_COLOR  = '#16a34a' // green
const DROPOFF_COLOR = '#dc2626' // red

// Returns { address, city } — city extracted from Mapbox context (no extra API call)
function reverseGeocode(lng, lat, token) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1&types=address,place`
  return fetch(url)
    .then((r) => r.json())
    .then((d) => {
      const feature = d.features?.[0]
      if (!feature) return { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, city: '' }
      const address = feature.place_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      const placeCtx = feature.context?.find((c) => c.id?.startsWith('place.'))
      const city = placeCtx?.text ?? (feature.place_type?.[0] === 'place' ? feature.text : '') ?? ''
      return { address, city }
    })
    .catch(() => ({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, city: '' }))
}

function forwardGeocode(query, token) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=5`
  return fetch(url)
    .then((r) => r.json())
    .then((d) => d.features ?? [])
    .catch(() => [])
}

function makeMarkerEl(color, label) {
  const el = document.createElement('div')
  el.style.cssText = `
    width:34px;height:34px;border-radius:50%;background:${color};
    color:#fff;font-size:11px;font-weight:700;display:flex;
    align-items:center;justify-content:center;
    box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff;
    cursor:pointer;user-select:none;
  `
  el.textContent = label
  return el
}

/**
 * BookingMap — exactly 1 pickup + 1 drop-off, no more.
 *
 * Ref handle:
 *   removeStop(index) — 0 = pickup, 1 = dropoff
 *   clearAll()        — remove both and reset search
 */
const BookingMap = forwardRef(function BookingMap({ onStopsChange }, ref) {
  const containerRef  = useRef(null)
  const mapRef        = useRef(null)
  const mapboxglRef   = useRef(null)
  const tokenRef      = useRef(null)
  const pickupMarker  = useRef(null)
  const dropoffMarker = useRef(null)

  const [pickup,  setPickup]  = useState(null) // { lng, lat, address, city }
  const [dropoff, setDropoff] = useState(null)
  const [placing, setPlacing] = useState(null) // 'pickup' | 'dropoff' | null

  const [searchQuery,  setSearchQuery]  = useState('')
  const [suggestions,  setSuggestions]  = useState([])
  const [searching,    setSearching]    = useState(false)

  // Notify parent whenever stops change
  useEffect(() => {
    const stops = []
    if (pickup)  stops.push({ type: 'pickup',  order: 0, ...pickup })
    if (dropoff) stops.push({ type: 'dropoff', order: 1, ...dropoff })
    onStopsChange?.(stops)
  }, [pickup, dropoff, onStopsChange])

  // ── Imperative handle ─────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    removeStop(index) {
      if (index === 0) {
        pickupMarker.current?.remove()
        pickupMarker.current = null
        setPickup(null)
      } else {
        dropoffMarker.current?.remove()
        dropoffMarker.current = null
        setDropoff(null)
      }
    },
    clearAll() {
      pickupMarker.current?.remove()
      dropoffMarker.current?.remove()
      pickupMarker.current  = null
      dropoffMarker.current = null
      setPickup(null)
      setDropoff(null)
      setSearchQuery('')
      setSuggestions([])
      setPlacing(null)
    },
  }))

  // ── Map init ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let map
    import('mapbox-gl').then((mod) => {
      const mapboxgl = mod.default
      mapboxglRef.current = mapboxgl

      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (!token) { console.error('NEXT_PUBLIC_MAPBOX_TOKEN not set'); return }
      tokenRef.current = token
      mapboxgl.accessToken = token

      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-114.0719, 51.0447], // Calgary, AB
        zoom: 12,
      })
      mapRef.current = map

    })

    return () => map?.remove()
  }, [])

  // ── Place a stop at the current map centre ────────────────────────────────

  async function handlePlace(type) {
    const map   = mapRef.current
    const token = tokenRef.current
    const mapboxgl = mapboxglRef.current
    if (!map || !token || !mapboxgl) return

    setPlacing(type)
    try {
      const { lng, lat } = map.getCenter()
      const { address, city } = await reverseGeocode(lng, lat, token)
      const stop = { lng, lat, address, city }

      if (type === 'pickup') {
        pickupMarker.current?.remove()
        const el = makeMarkerEl(PICKUP_COLOR, 'P')
        pickupMarker.current = new mapboxgl.Marker({ element: el, draggable: false })
          .setLngLat([lng, lat])
          .addTo(map)
        setPickup(stop)
      } else {
        dropoffMarker.current?.remove()
        const el = makeMarkerEl(DROPOFF_COLOR, 'D')
        dropoffMarker.current = new mapboxgl.Marker({ element: el, draggable: false })
          .setLngLat([lng, lat])
          .addTo(map)
        setDropoff(stop)
      }
    } finally {
      setPlacing(null)
    }
  }

  // ── Address search ────────────────────────────────────────────────────────

  async function handleSearch() {
    const token = tokenRef.current
    if (!searchQuery.trim() || !token) return
    setSearching(true)
    try {
      setSuggestions(await forwardGeocode(searchQuery, token))
    } finally {
      setSearching(false)
    }
  }

  function pickSuggestion(feature) {
    const [lng, lat] = feature.center
    setSuggestions([])
    setSearchQuery('')
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 15, duration: 700 })
  }

  // ── Hint text ─────────────────────────────────────────────────────────────

  const hint = !pickup && !dropoff
    ? 'Pan the map, then set your Pickup and Drop-off points'
    : !pickup
    ? 'Pan to your pickup location and click "Set Pickup"'
    : !dropoff
    ? 'Pan to the drop-off location and click "Set Drop-off"'
    : 'Both points set — you can reposition either one'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2 w-full h-full">

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSuggestions([]) }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search address to pan map…"
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3.5 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-surface border border-border rounded-lg shadow-lg overflow-hidden">
              {suggestions.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => pickSuggestion(f)}
                    className="w-full text-left px-3.5 py-2.5 text-sm text-foreground hover:bg-surface dark:hover:bg-white/5 transition"
                  >
                    {f.place_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || !searchQuery.trim()}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0"
        >
          {searching ? '…' : 'Search'}
        </button>
      </div>

      {/* Map */}
      <div className="relative flex-1 min-h-0" style={{ minHeight: 340 }}>
        <div ref={containerRef} className="map-container rounded-xl overflow-hidden h-full w-full" />

        {/* Crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg width="36" height="44" viewBox="0 0 36 44"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.4))', marginBottom: 22 }}>
            <path d="M18 0C10.268 0 4 6.268 4 14c0 9.941 14 30 14 30S32 23.941 32 14C32 6.268 25.732 0 18 0z" fill="#2563eb" />
            <circle cx="18" cy="14" r="6" fill="#fff" />
          </svg>
        </div>

        {/* Hint pill */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-surface/90 backdrop-blur-sm text-xs text-foreground px-3 py-1.5 rounded-full shadow border border-border pointer-events-none whitespace-nowrap">
          {hint}
        </div>

        {/* Two action buttons — bottom centre */}
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-2">
          <button
            type="button"
            onClick={() => handlePlace('pickup')}
            disabled={placing !== null}
            className={[
              'px-4 py-2.5 rounded-full text-white text-sm font-semibold shadow-lg transition',
              pickup
                ? 'bg-green-700 hover:bg-green-800'
                : 'bg-green-600 hover:bg-green-700',
              placing !== null ? 'opacity-60 cursor-not-allowed' : '',
            ].join(' ')}
          >
            {placing === 'pickup' ? 'Setting…' : pickup ? '✓ Pickup' : '+ Set Pickup'}
          </button>
          <button
            type="button"
            onClick={() => handlePlace('dropoff')}
            disabled={placing !== null}
            className={[
              'px-4 py-2.5 rounded-full text-white text-sm font-semibold shadow-lg transition',
              dropoff
                ? 'bg-red-700 hover:bg-red-800'
                : 'bg-red-600 hover:bg-red-700',
              placing !== null ? 'opacity-60 cursor-not-allowed' : '',
            ].join(' ')}
          >
            {placing === 'dropoff' ? 'Setting…' : dropoff ? '✓ Drop-off' : '+ Set Drop-off'}
          </button>
        </div>
      </div>
    </div>
  )
})

export default BookingMap
