'use client'

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { reverseGeocode, forwardGeocode } from '@/lib/mapbox-geocode'
import { MapPin } from 'lucide-react'

const PICKUP_COLOR  = '#16a34a' // green
const DROPOFF_COLOR = '#dc2626' // red

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
  const [locating,     setLocating]     = useState(false)
  const [mapActive,    setMapActive]    = useState(false) // scroll-zoom guard

  const searchDebounceRef = useRef(null)
  const searchAbortRef    = useRef(null)

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
    // Pre-seed pickup from an external coordinate (e.g. customer's saved address)
    setPickupCoords(lng, lat, address, city) {
      const mapboxgl = mapboxglRef.current
      const map = mapRef.current
      if (!mapboxgl || !map) return
      pickupMarker.current?.remove()
      const el = makeMarkerEl(PICKUP_COLOR, 'P')
      pickupMarker.current = new mapboxgl.Marker({ element: el, draggable: false })
        .setLngLat([lng, lat])
        .addTo(map)
      map.flyTo({ center: [lng, lat], zoom: 14, duration: 800 })
      setPickup({ lng, lat, address, city })
      setPlacing(null)
    },
    setPlacing(val) { setPlacing(val) },
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
        scrollZoom: false, // disabled until user explicitly activates the map
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

  function handleSearchChange(value) {
    setSearchQuery(value)

    clearTimeout(searchDebounceRef.current)
    searchAbortRef.current?.abort()
    searchAbortRef.current = null

    if (!value.trim()) {
      setSuggestions([])
      setSearching(false)
      return
    }

    setSearching(true)
    searchDebounceRef.current = setTimeout(async () => {
      const token = tokenRef.current
      if (!token) { setSearching(false); return }
      const controller = new AbortController()
      searchAbortRef.current = controller
      try {
        setSuggestions(await forwardGeocode(value, token, controller.signal))
      } catch (err) {
        if (err?.name !== 'AbortError') setSuggestions([])
      } finally {
        if (searchAbortRef.current === controller) {
          setSearching(false)
          searchAbortRef.current = null
        }
      }
    }, 350)
  }

  function pickSuggestion(feature) {
    const [lng, lat] = feature.center
    setSuggestions([])
    setSearchQuery('')
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 15, duration: 700 })
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) return
    setLocating(true)

    // Keep trying to refine the fix for up to ~15s. On desktop browsers, the
    // first callback is often a low-accuracy IP/Wi-Fi fix (can be off by
    // kilometres); GPS/sensor-fusion arrives a few seconds later with a much
    // tighter accuracy radius. We zoom the map based on accuracy.
    let settled = false
    let bestPos = null
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { longitude: lng, latitude: lat, accuracy } = pos.coords
        // Keep the most accurate fix seen so far
        if (!bestPos || accuracy < bestPos.accuracy) {
          bestPos = { lng, lat, accuracy }
          // Zoom tighter when the fix is more accurate
          const zoom = accuracy < 50 ? 17 : accuracy < 200 ? 15 : accuracy < 2000 ? 13 : 11
          mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 600 })
        }
        // Settle once we've got a reasonable fix (<100 m)
        if (accuracy <= 100 && !settled) {
          settled = true
          navigator.geolocation.clearWatch(watchId)
          setLocating(false)
        }
      },
      (err) => {
        console.warn('[BookingMap] geolocation error:', err)
        navigator.geolocation.clearWatch(watchId)
        setLocating(false)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    )

    // Hard timeout fallback — stop spinning even if no accurate fix arrived
    setTimeout(() => {
      if (!settled) {
        settled = true
        navigator.geolocation.clearWatch(watchId)
        setLocating(false)
      }
    }, 15000)
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
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && handleSearchChange('')}
            placeholder="Search address to pan map…"
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3.5 py-2 pr-8 text-sm text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {/* Right-side spinner or clear button */}
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
            {searching ? (
              <svg width="14" height="14" viewBox="0 0 16 16" style={{ animation: 'spin 0.8s linear infinite', color: 'var(--fg-3)' }}>
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="25 10" />
              </svg>
            ) : searchQuery ? (
              <button type="button" onClick={() => handleSearchChange('')} style={{ color: 'var(--fg-3)', lineHeight: 1 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            ) : null}
          </div>
          {(suggestions.length > 0 || (searching && searchQuery)) && (
            <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-surface border border-border rounded-lg shadow-lg overflow-hidden">
              {searching && suggestions.length === 0 ? (
                <li className="px-3.5 py-2.5 text-sm flex items-center gap-2" style={{ color: 'var(--fg-3)' }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="25 10" />
                  </svg>
                  Searching…
                </li>
              ) : suggestions.map((f) => (
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
          onClick={handleUseCurrentLocation}
          disabled={locating}
          className="p-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0 flex items-center justify-center text-white shadow-sm"
          title="Jump to your current location"
        >
          {locating ? (
            <span className="text-xs">…</span>
          ) : (
            <MapPin size={18} />
          )}
        </button>
      </div>

      {/* Map */}
      <div
        className="relative flex-1 min-h-0"
        style={{ minHeight: 340 }}
        onMouseLeave={() => {
          // Re-disable scroll zoom when mouse leaves the map area
          if (mapRef.current) mapRef.current.scrollZoom.disable()
          setMapActive(false)
        }}
      >
        <div ref={containerRef} className="map-container rounded-xl overflow-hidden h-full w-full" />

        {/* Crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg width="36" height="44" viewBox="0 0 36 44"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.4))', marginBottom: 22 }}>
            <path d="M18 0C10.268 0 4 6.268 4 14c0 9.941 14 30 14 30S32 23.941 32 14C32 6.268 25.732 0 18 0z" fill="#2563eb" />
            <circle cx="18" cy="14" r="6" fill="#fff" />
          </svg>
        </div>

        {/* Scroll-zoom guard overlay — click to activate scroll zoom */}
        {!mapActive && (
          <div
            className="absolute inset-0 rounded-xl z-10 flex items-end justify-center pb-5 cursor-pointer"
            style={{ background: 'transparent' }}
            onClick={() => {
              if (mapRef.current) mapRef.current.scrollZoom.enable()
              setMapActive(true)
            }}
          >
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold pointer-events-none select-none"
              style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(4px)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              Click map to enable scroll zoom
            </div>
          </div>
        )}

        {/* Placing overlay */}
        {placing && (
          <div
            className="absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-3 pointer-events-none"
            style={{ background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(3px)', zIndex: 30 }}
          >
            <svg width="36" height="36" viewBox="0 0 36 36"
              style={{ animation: 'spin 0.75s linear infinite' }}>
              <circle cx="18" cy="18" r="14" fill="none"
                stroke={placing === 'pickup' ? '#16a34a' : '#dc2626'}
                strokeWidth="3" strokeOpacity="0.2" />
              <path d="M18 4 A14 14 0 0 1 32 18"
                fill="none"
                stroke={placing === 'pickup' ? '#16a34a' : '#dc2626'}
                strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span className="text-xs font-bold px-3 py-1.5 rounded-full"
              style={{
                background: placing === 'pickup' ? '#16a34a' : '#dc2626',
                color: '#fff',
              }}>
              Setting {placing === 'pickup' ? 'Pickup' : 'Drop-off'}…
            </span>
          </div>
        )}

        {/* Hint pill */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-surface/90 backdrop-blur-sm text-xs text-foreground px-3 py-1.5 rounded-full shadow border border-border pointer-events-none whitespace-nowrap" style={{ zIndex: 20 }}>
          {hint}
        </div>

        {/* Two action buttons — bottom centre */}
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-2" style={{ zIndex: 20 }}>
          <button
            type="button"
            onClick={() => handlePlace('pickup')}
            disabled={placing !== null}
            className={[
              'px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-white text-xs sm:text-sm font-semibold shadow-lg transition',
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
              'px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-white text-xs sm:text-sm font-semibold shadow-lg transition',
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
