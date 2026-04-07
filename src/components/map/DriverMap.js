'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import polyline from '@mapbox/polyline'

// How far off-corridor (metres) before we consider the driver off-route
const OFF_ROUTE_THRESHOLD_M  = 300
// How long (ms) the driver must stay off-route before we trigger a reroute
const OFF_ROUTE_DURATION_MS  = 30000
// Minimum movement (m) before re-fetching the active leg (heading update + step refresh)
const LEG_REFETCH_DISTANCE_M = 50
// Minimum time (ms) between active-leg fetches
const LEG_REFETCH_MIN_MS     = 15000
// Speak when this close to the next turn (metres)
const SPEAK_AT_M             = 150

// Turn type → arrow emoji
const MANEUVER_ICON = {
  'turn right':          '↱',
  'turn left':           '↰',
  'turn sharp right':    '↱',
  'turn sharp left':     '↰',
  'turn slight right':   '↗',
  'turn slight left':    '↖',
  'straight':            '↑',
  'roundabout':          '↻',
  'rotary':              '↻',
  'fork right':          '↱',
  'fork left':           '↰',
  'merge':               '↑',
  'ramp right':          '↱',
  'ramp left':           '↰',
  'arrive':              '📍',
  'depart':              '🚦',
  'ferry':               '⛴',
  'u-turn':              '↩',
}

function getManeuverIcon(step) {
  if (!step?.maneuver) return '↑'
  const mod  = step.maneuver.modifier ?? ''
  const type = step.maneuver.type ?? ''
  const key  = mod ? `${type} ${mod}`.trim() : type
  return MANEUVER_ICON[key] ?? MANEUVER_ICON[type] ?? '↑'
}

function formatDist(m) {
  if (m == null) return ''
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m / 10) * 10} m`
}

function haversineM(a, b) {
  const R    = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s    = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

/**
 * Bearing (degrees, 0=North, clockwise) from point a → point b.
 * Used to rotate the car icon when GPS heading is unavailable.
 */
function bearingDeg(a, b) {
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

/**
 * Minimum distance (metres) from point p to the nearest segment in a polyline.
 * coords = [[lng, lat], ...]  (GeoJSON order)
 */
function distToPolylineM(p, coords) {
  let minDist = Infinity
  for (let i = 0; i < coords.length - 1; i++) {
    const a = { lng: coords[i][0],     lat: coords[i][1] }
    const b = { lng: coords[i + 1][0], lat: coords[i + 1][1] }
    const d = pointToSegmentM(p, a, b)
    if (d < minDist) minDist = d
  }
  return minDist
}

/**
 * Distance from point p to segment ab (all in lng/lat, result in metres).
 * Projects p onto the segment and clamps to [a,b].
 */
function pointToSegmentM(p, a, b) {
  const dx  = b.lng - a.lng
  const dy  = b.lat - a.lat
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return haversineM(p, a)
  const t = Math.max(0, Math.min(1, ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / len2))
  return haversineM(p, { lng: a.lng + t * dx, lat: a.lat + t * dy })
}

// Car arrow SVG — points UP. We rotate the outer div by heading degrees.
const CAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
  <defs>
    <filter id="dropshadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="rgba(0,0,0,0.4)"/>
    </filter>
  </defs>
  <polygon points="18,2 34,38 18,30 2,38" fill="#2563eb" filter="url(#dropshadow)"/>
  <polygon points="18,8 28,34 18,27 8,34" fill="white" opacity="0.92"/>
</svg>
`

export default function DriverMap({
  route,
  activeStopIndex = 0,
  driverPos = null,
  driverId = null,
  onStepUpdate,
  onReroute,
}) {
  const containerRef       = useRef(null)
  const mapRef             = useRef(null)
  const mapboxglRef        = useRef(null)
  const markersRef         = useRef([])
  const driverMarkerRef    = useRef(null)

  // Current heading in degrees (0=North). Updated from GPS heading OR computed bearing.
  const headingRef         = useRef(0)
  // Previous position — used to compute bearing when GPS heading is null
  const prevPosRef         = useRef(null)

  const activeStopIndexRef = useRef(activeStopIndex)
  const driverPosRef       = useRef(driverPos)
  const routeRef           = useRef(route)
  const onStepUpdateRef    = useRef(onStepUpdate)
  const onRerouteRef       = useRef(onReroute)
  const driverIdRef        = useRef(driverId)

  // Turn-by-turn state
  const stepsRef           = useRef([])   // steps for current active leg
  // Index of the *next* upcoming step (the one we're heading toward)
  // Tracked separately per active destination — reset on new leg fetch
  const nextStepIdxRef     = useRef(0)
  // Last step index for which we spoke — prevents repeating the same announcement
  const lastSpokenStepRef  = useRef(-1)

  // Active leg fetch throttle
  const lastLegFetchPos    = useRef(null)
  const lastLegFetchTime   = useRef(0)

  // Active leg route corridor coords [[lng,lat],...] for off-route detection
  const corridorCoordsRef  = useRef([])

  // Off-route tracking
  const offRouteSinceRef   = useRef(null)  // timestamp when we first went off-route; null = on-route
  const reroutingRef       = useRef(false) // prevent concurrent reroute calls

  // ── Sync refs ─────────────────────────────────────────────────────────────
  useEffect(() => { activeStopIndexRef.current = activeStopIndex }, [activeStopIndex])
  useEffect(() => { routeRef.current = route }, [route])
  useEffect(() => { if (driverPos) driverPosRef.current = driverPos }, [driverPos])
  useEffect(() => { onStepUpdateRef.current = onStepUpdate }, [onStepUpdate])
  useEffect(() => { onRerouteRef.current = onReroute }, [onReroute])
  useEffect(() => { driverIdRef.current = driverId }, [driverId])

  // ── Banner state ──────────────────────────────────────────────────────────
  const [banner, setBanner] = useState(null) // { icon, instruction, distance }
  const [offRoute, setOffRoute] = useState(false)

  // ── Gray full route ───────────────────────────────────────────────────────
  const renderFullRouteGray = useCallback((map, enc) => {
    if (!map || !enc) return
    const coords = polyline.decode(enc, 6).map(([lat, lng]) => [lng, lat])
    if (map.getLayer('route-full')) map.removeLayer('route-full')
    if (map.getSource('route-full')) map.removeSource('route-full')
    map.addSource('route-full', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } },
    })
    map.addLayer({
      id: 'route-full', type: 'line', source: 'route-full',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#d1d5db', 'line-width': 4, 'line-opacity': 0.8 },
    })
  }, [])

  // ── Active leg in blue + extract steps ───────────────────────────────────
  // resetStepTracking=true when switching to a new destination (clears spoken state)
  // resetStepTracking=false for mid-route refreshes (preserves spoken state)
  const renderActiveLeg = useCallback(async (map, fromLng, fromLat, toStop, resetStepTracking = false) => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || !toStop || !map) return
    try {
      const wpts = `${fromLng},${fromLat};${toStop.coordinates.lng},${toStop.coordinates.lat}`
      const url  = `https://api.mapbox.com/directions/v5/mapbox/driving/${encodeURIComponent(wpts)}?geometries=polyline6&overview=full&steps=true&access_token=${token}`
      const res  = await fetch(url)
      if (!res.ok) return
      const data  = await res.json()
      const route = data.routes?.[0]
      if (!route) return

      // Draw blue line
      const coords = polyline.decode(route.geometry, 6).map(([lat, lng]) => [lng, lat])
      corridorCoordsRef.current = coords

      if (map.getLayer('route-active')) map.removeLayer('route-active')
      if (map.getSource('route-active')) map.removeSource('route-active')
      map.addSource('route-active', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } },
      })
      map.addLayer({
        id: 'route-active', type: 'line', source: 'route-active',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': 6, 'line-opacity': 0.95 },
      })

      // Store steps for turn-by-turn
      const steps = route.legs?.[0]?.steps ?? []
      stepsRef.current = steps

      if (resetStepTracking) {
        nextStepIdxRef.current   = 0
        lastSpokenStepRef.current = -1
      }

      // Reset off-route state — we have a fresh corridor
      offRouteSinceRef.current = null
      setOffRoute(false)

      // Show first upcoming step in banner
      if (steps.length > 0) {
        const first = steps[nextStepIdxRef.current] ?? steps[0]
        setBanner({
          icon:        getManeuverIcon(first),
          instruction: first.maneuver?.instruction ?? '',
          distance:    formatDist(first.distance),
        })
        // Only announce on new destination, not on mid-route refreshes
        if (resetStepTracking) onStepUpdateRef.current?.(first)
      }
    } catch (err) {
      console.warn('[DriverMap] active leg fetch failed:', err)
    }
  }, [])

  // ── Update turn banner: advance nextStepIdx as driver passes each step ────
  const updateTurnBanner = useCallback((lng, lat) => {
    const steps = stepsRef.current
    if (!steps.length) return

    // Advance the pointer: if the driver has passed the current step's start
    // location (within 30m), move to the next step.
    while (nextStepIdxRef.current < steps.length - 1) {
      const cur = steps[nextStepIdxRef.current]
      const [sLng, sLat] = cur.maneuver.location
      const distToStart = haversineM({ lng, lat }, { lng: sLng, lat: sLat })
      // We've moved past this step's maneuver point — advance
      if (distToStart < 30) {
        nextStepIdxRef.current++
        // When we advance past a step, clear its spoken record so the next step
        // can be announced fresh
        if (lastSpokenStepRef.current === nextStepIdxRef.current - 1) {
          lastSpokenStepRef.current = nextStepIdxRef.current - 1
        }
        break
      }
      // Not yet past this step's start — stop advancing
      break
    }

    const idx  = nextStepIdxRef.current
    const step = steps[idx]
    if (!step) return

    // Distance from driver to this step's maneuver point
    const [sLng, sLat] = step.maneuver.location
    const distToTurn = haversineM({ lng, lat }, { lng: sLng, lat: sLat })

    setBanner({
      icon:        getManeuverIcon(step),
      instruction: step.maneuver?.instruction ?? '',
      distance:    formatDist(distToTurn),
    })

    // Speak once when within SPEAK_AT_M of the next turn
    if (distToTurn <= SPEAK_AT_M && idx !== lastSpokenStepRef.current) {
      lastSpokenStepRef.current = idx
      onStepUpdateRef.current?.(step, distToTurn)
    }
  }, [])

  // ── Off-route detection + server-side reroute trigger ─────────────────────
  const checkOffRoute = useCallback(async (lng, lat) => {
    const corridor = corridorCoordsRef.current
    if (!corridor.length || reroutingRef.current) return

    const dist = distToPolylineM({ lng, lat }, corridor)

    if (dist > OFF_ROUTE_THRESHOLD_M) {
      if (offRouteSinceRef.current === null) {
        offRouteSinceRef.current = Date.now()
        setOffRoute(true)
      } else if (Date.now() - offRouteSinceRef.current >= OFF_ROUTE_DURATION_MS) {
        // Driver has been off-route for too long — trigger server reroute
        reroutingRef.current = true
        offRouteSinceRef.current = null
        setOffRoute(false)
        try {
          const id = driverIdRef.current
          if (!id) return
          const res = await fetch(`/api/drivers/${id}/reroute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentLng: lng, currentLat: lat }),
          })
          if (res.ok) {
            const { route: newRoute } = await res.json()
            if (newRoute) onRerouteRef.current?.(newRoute)
          }
        } catch (err) {
          console.warn('[DriverMap] reroute request failed:', err)
        } finally {
          reroutingRef.current = false
        }
      }
    } else {
      // Back on route
      if (offRouteSinceRef.current !== null) {
        offRouteSinceRef.current = null
        setOffRoute(false)
      }
    }
  }, [])

  // ── Create/update driver car marker with heading ──────────────────────────
  // IMPORTANT: Mapbox sets its own transform on the marker's root element to
  // position it on screen. We must NOT touch that element's transform.
  // Instead we rotate an inner wrapper div that holds only the SVG.
  const carInnerRef = useRef(null)

  const updateDriverMarker = useCallback((map, mapboxgl, lng, lat, gpsHeading) => {
    // Use GPS heading if available; otherwise compute bearing from movement
    let deg = headingRef.current
    if (gpsHeading != null && !isNaN(gpsHeading)) {
      deg = gpsHeading
      headingRef.current = gpsHeading
    } else if (prevPosRef.current) {
      const moved = haversineM(prevPosRef.current, { lng, lat })
      if (moved > 3) {
        deg = bearingDeg(prevPosRef.current, { lng, lat })
        headingRef.current = deg
      }
    }
    prevPosRef.current = { lng, lat }

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLngLat([lng, lat])
      // Rotate only the inner SVG wrapper — never the marker root element
      if (carInnerRef.current) {
        carInnerRef.current.style.transform = `rotate(${deg}deg)`
      }
      return
    }

    // Outer div: sized to marker, no transform (Mapbox owns this)
    const el = document.createElement('div')
    el.style.cssText = 'width:36px;height:44px;cursor:pointer;'

    // Inner div: this is what we rotate
    const inner = document.createElement('div')
    inner.style.cssText = `
      width:36px;height:44px;
      transform:rotate(${deg}deg);
      transform-origin:center center;
      transition:transform 0.35s ease-out;
    `
    inner.innerHTML = CAR_SVG
    el.appendChild(inner)
    carInnerRef.current = inner

    driverMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map)
  }, [])

  // ── Stop markers ─────────────────────────────────────────────────────────
  const renderStopMarkers = useCallback((map, stops, mapboxgl, currentIndex) => {
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    stops.forEach((stop, i) => {
      const done   = i < currentIndex
      const active = i === currentIndex
      // Completed → checkmark. Others → fixed 1-based position (never renumbers)
      const label  = done ? '✓' : String(i + 1)

      const el = document.createElement('div')
      el.style.cssText = `
        width:34px;height:34px;border-radius:50%;
        background:${done ? '#9ca3af' : active ? '#2563eb' : stop.stopType === 'pickup' ? '#16a34a' : '#dc2626'};
        color:#fff;font-size:${done ? '16px' : '13px'};font-weight:700;
        display:flex;align-items:center;justify-content:center;
        box-shadow:${active ? '0 0 0 4px rgba(37,99,235,0.35)' : '0 2px 6px rgba(0,0,0,.3)'};
        border:2px solid #fff;opacity:${done ? 0.5 : 1};
      `
      el.textContent = label

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([stop.coordinates.lng, stop.coordinates.lat])
        .setPopup(new mapboxgl.Popup({ offset: 20, closeButton: false }).setHTML(
          `<div style="font-size:12px;font-weight:600">${stop.stopType === 'pickup' ? '🟢 Pickup' : '🔴 Drop-off'}</div>
           <div style="font-size:11px;color:#555;margin-top:2px">${stop.address}</div>`
        ))
        .addTo(map)
      markersRef.current.push(marker)
    })
  }, [])

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!route) return
    let map

    import('mapbox-gl').then((mod) => {
      const mapboxgl = mod.default
      mapboxglRef.current = mapboxgl
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (!token || !containerRef.current) return

      mapboxgl.accessToken = token

      const idx        = activeStopIndexRef.current
      const stops      = route.optimizedStops ?? []
      const activeStop = stops[idx] ?? stops[0]

      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: activeStop ? [activeStop.coordinates.lng, activeStop.coordinates.lat] : [101.6869, 3.139],
        zoom: 15,
      })
      mapRef.current = map

      const geolocate = new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: false,
        showUserLocation: false,
      })
      map.addControl(geolocate, 'bottom-right')
      map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right')

      map.on('load', () => {
        const i    = activeStopIndexRef.current
        const stps = routeRef.current?.optimizedStops ?? []
        renderStopMarkers(map, stps, mapboxgl, i)
        renderFullRouteGray(map, routeRef.current?.encodedPolyline)

        const pos      = driverPosRef.current
        const nextStop = stps[i]
        if (nextStop) {
          const fromLng = pos?.lng ?? nextStop.coordinates.lng
          const fromLat = pos?.lat ?? nextStop.coordinates.lat
          if (pos) updateDriverMarker(map, mapboxgl, fromLng, fromLat, null)
          renderActiveLeg(map, fromLng, fromLat, nextStop, true)
          lastLegFetchPos.current  = { lng: fromLng, lat: fromLat }
          lastLegFetchTime.current = Date.now()
        }

        geolocate.trigger()
      })

      geolocate.on('geolocate', (e) => {
        const { longitude: lng, latitude: lat, heading } = e.coords
        driverPosRef.current = { lng, lat }

        const i        = activeStopIndexRef.current
        const nextStop = routeRef.current?.optimizedStops?.[i]

        updateDriverMarker(map, mapboxgl, lng, lat, heading)
        updateTurnBanner(lng, lat)
        checkOffRoute(lng, lat)

        if (!nextStop) return

        const now     = Date.now()
        const lastPos = lastLegFetchPos.current
        const moved   = lastPos ? haversineM(lastPos, { lng, lat }) : Infinity
        const elapsed = now - lastLegFetchTime.current

        // Refresh active leg if we've moved enough AND enough time has passed
        // resetStepTracking=false — preserve step pointer, just update corridor geometry
        if (moved >= LEG_REFETCH_DISTANCE_M && elapsed >= LEG_REFETCH_MIN_MS) {
          lastLegFetchPos.current  = { lng, lat }
          lastLegFetchTime.current = now
          renderActiveLeg(map, lng, lat, nextStop, false)
        }
      })
    })

    return () => {
      driverMarkerRef.current = null
      map?.remove()
    }
  }, []) // mount once

  // ── Active stop changed ───────────────────────────────────────────────────
  useEffect(() => {
    const map      = mapRef.current
    const mapboxgl = mapboxglRef.current
    if (!map || !mapboxgl || !map.isStyleLoaded()) return

    const stops    = routeRef.current?.optimizedStops ?? []
    renderStopMarkers(map, stops, mapboxgl, activeStopIndex)

    const nextStop = stops[activeStopIndex]
    if (nextStop) {
      map.flyTo({ center: [nextStop.coordinates.lng, nextStop.coordinates.lat], zoom: 15, duration: 900 })
      const pos     = driverPosRef.current
      const fromLng = pos?.lng ?? nextStop.coordinates.lng
      const fromLat = pos?.lat ?? nextStop.coordinates.lat
      // New destination — reset step tracking
      renderActiveLeg(map, fromLng, fromLat, nextStop, true)
      lastLegFetchPos.current  = { lng: fromLng, lat: fromLat }
      lastLegFetchTime.current = Date.now()
    } else {
      setBanner(null)
      if (map.getLayer('route-active')) map.removeLayer('route-active')
      if (map.getSource('route-active')) map.removeSource('route-active')
    }
  }, [activeStopIndex])

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />

      {/* ── Turn-by-turn banner ─────────────────────────────────────────── */}
      {banner && (
        <div
          className="absolute top-16 left-3 right-3 z-30 flex items-center gap-3 rounded-2xl px-4 py-3 pointer-events-none"
          style={{ background: 'rgba(15,23,42,0.88)', backdropFilter: 'blur(8px)' }}
        >
          <div className="shrink-0 w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-2xl font-bold text-white">
            {banner.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm leading-snug">{banner.instruction}</p>
            {banner.distance && (
              <p className="text-blue-300 text-xs font-semibold mt-0.5">{banner.distance}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Off-route warning banner ────────────────────────────────────── */}
      {offRoute && (
        <div
          className="absolute top-32 left-3 right-3 z-30 flex items-center gap-2 rounded-2xl px-4 py-2.5 pointer-events-none"
          style={{ background: 'rgba(220,38,38,0.9)', backdropFilter: 'blur(8px)' }}
        >
          <span className="text-white text-lg">⚠️</span>
          <p className="text-white text-xs font-semibold">Off route — recalculating in {OFF_ROUTE_DURATION_MS / 1000}s…</p>
        </div>
      )}
    </div>
  )
}
