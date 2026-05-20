'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import polyline from '@mapbox/polyline'

// How far off-corridor (metres) before we consider the driver off-route
const OFF_ROUTE_THRESHOLD_M  = 300
// How long (ms) the driver must stay off-route before we trigger a reroute
const OFF_ROUTE_DURATION_MS  = 30000
// Speak when this close to the next turn (metres)
const SPEAK_AT_M             = 150
// Trigger arrival when driver is within this radius of the stop (metres)
const ARRIVAL_RADIUS_M       = 30

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
  onArrival,
  newStopIds = null,
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
  // Initialised directly from the prop so map init can read the GPS immediately
  // before any useEffect has run.
  const driverPosRef       = useRef(driverPos)
  const routeRef           = useRef(route)
  const onStepUpdateRef    = useRef(onStepUpdate)
  const onRerouteRef       = useRef(onReroute)
  const driverIdRef        = useRef(driverId)
  const newStopIdsRef          = useRef(newStopIds)
  // Holds the renderStopMarkers callback once it is defined below.
  // Using a ref avoids a temporal-dead-zone ReferenceError that occurs when
  // the useEffect dep-array is evaluated before the useCallback declaration.
  const renderStopMarkersRef   = useRef(null)

  // Turn-by-turn state
  const stepsRef           = useRef([])   // steps for current active leg
  // Index of the *next* upcoming step (the one we're heading toward)
  // Tracked separately per active destination — reset on new leg fetch
  const nextStepIdxRef     = useRef(0)
  // Last step index for which we spoke — prevents repeating the same announcement
  const lastSpokenStepRef  = useRef(-1)

  // Active leg route corridor coords [[lng,lat],...] for off-route detection
  const corridorCoordsRef  = useRef([])
  // In-flight active-leg fetch — aborted when a newer request supersedes it
  const legAbortRef        = useRef(null)

  // Off-route tracking
  const offRouteSinceRef   = useRef(null)  // timestamp when we first went off-route; null = on-route
  const reroutingRef       = useRef(false) // prevent concurrent reroute calls

  // Arrival tracking — fires onArrival once per stop index, resets when active stop changes
  const onArrivalRef       = useRef(onArrival)
  const arrivedStopRef     = useRef(-1)    // stopIndex for which arrival was already announced

  // ── Sync refs ─────────────────────────────────────────────────────────────
  useEffect(() => {
    activeStopIndexRef.current = activeStopIndex
    // New destination — allow arrival to fire again for the new stop
    if (arrivedStopRef.current !== -1 && arrivedStopRef.current !== activeStopIndex) {
      arrivedStopRef.current = -1
    }
  }, [activeStopIndex])
  useEffect(() => { routeRef.current = route }, [route])
  useEffect(() => { if (driverPos) driverPosRef.current = driverPos }, [driverPos])
  useEffect(() => { onStepUpdateRef.current = onStepUpdate }, [onStepUpdate])
  useEffect(() => { onRerouteRef.current = onReroute }, [onReroute])
  useEffect(() => { onArrivalRef.current = onArrival }, [onArrival])
  useEffect(() => { driverIdRef.current = driverId }, [driverId])
  useEffect(() => { newStopIdsRef.current = newStopIds }, [newStopIds])

  // Re-render markers when the set of new stops changes so pulse animation
  // appears/disappears without requiring a route change.
  // renderStopMarkersRef is used instead of the callback directly to avoid a
  // temporal-dead-zone ReferenceError (useCallback is a const, declared later).
  useEffect(() => {
    const map      = mapRef.current
    const mapboxgl = mapboxglRef.current
    if (!map || !mapboxgl || !map.isStyleLoaded()) return
    if (!renderStopMarkersRef.current) return
    const stops = routeRef.current?.optimizedStops ?? []
    renderStopMarkersRef.current(map, stops, mapboxgl, activeStopIndexRef.current, newStopIds)
  }, [newStopIds])

  // ── Camera follow state ───────────────────────────────────────────────────
  // true = map auto-pans to keep driver centered (default, like Google Maps)
  // false = driver manually panned away; tap the re-center button to re-lock
  const [followDriver, setFollowDriver] = useState(true)
  const followDriverRef = useRef(true)

  // ── Banner state ──────────────────────────────────────────────────────────
  const [banner, setBanner] = useState(null) // { icon, instruction, distance }
  const [offRoute, setOffRoute] = useState(false)
  const [locating, setLocating] = useState(false)

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
  // Fires ONLY when:
  //   - driver switches to a new destination (activeStopIndex changes),
  //   - a reroute has returned (onReroute callback),
  //   - map first mounts.
  // No periodic GPS-tick refetch — we drive turn-by-turn entirely from the
  // cached `stepsRef.current` + local Haversine in updateTurnBanner.
  //
  // resetStepTracking=true when switching to a new destination (clears spoken state)
  const renderActiveLeg = useCallback(async (map, fromLng, fromLat, toStop, resetStepTracking = false) => {
    if (!toStop || !map) return

    // Abort any in-flight request so a slower response can't overwrite a newer corridor
    legAbortRef.current?.abort()
    const ctrl = new AbortController()
    legAbortRef.current = ctrl

    try {
      const res = await fetch('/api/mapbox/directions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          from: { lng: fromLng, lat: fromLat },
          to:   { lng: toStop.coordinates.lng, lat: toStop.coordinates.lat },
          withSteps: true,
        }),
        signal: ctrl.signal,
      })
      if (!res.ok) return
      const data = await res.json()
      if (!data?.geometry) return

      const coords = polyline.decode(data.geometry, 6).map(([lat, lng]) => [lng, lat])
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

      const steps = data.steps ?? []
      stepsRef.current = steps

      if (resetStepTracking) {
        nextStepIdxRef.current    = 0
        lastSpokenStepRef.current = -1
      }

      offRouteSinceRef.current = null
      setOffRoute(false)

      if (steps.length > 0) {
        const first = steps[nextStepIdxRef.current] ?? steps[0]
        setBanner({
          icon:        getManeuverIcon(first),
          instruction: first.maneuver?.instruction ?? '',
          distance:    formatDist(first.distance),
        })
        if (resetStepTracking) onStepUpdateRef.current?.(first)
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
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

  // ── Re-centre + re-lock follow mode ──────────────────────────────────────
  const handleUseCurrentLocation = useCallback(() => {
    const pos = driverPosRef.current
    if (pos && mapRef.current) {
      mapRef.current.easeTo({ center: [pos.lng, pos.lat], zoom: 15, duration: 600 })
      followDriverRef.current = true
      setFollowDriver(true)
      return
    }
    // Fallback: no cached GPS yet — ask the browser directly
    if (!navigator.geolocation || !mapRef.current) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude: lng, latitude: lat } = pos.coords
        mapRef.current?.easeTo({ center: [lng, lat], zoom: 15, duration: 600 })
        followDriverRef.current = true
        setFollowDriver(true)
        setLocating(false)
      },
      () => {
        console.warn('Geolocation permission denied')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
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

    // Outer div: sized to marker. Mapbox sets 'translate' on this element to
    // position the marker on screen. Adding a CSS transition here smooths the
    // jump between GPS ticks without any extra API calls.
    const el = document.createElement('div')
    el.style.cssText = 'width:36px;height:44px;cursor:pointer;transition:translate 0.4s linear;'

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
  const renderStopMarkers = useCallback((map, stops, mapboxgl, currentIndex, pulseIds) => {
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    stops.forEach((stop, i) => {
      const done   = i < currentIndex
      const active = i === currentIndex
      const isEndpoint = stop.stopType === 'endpoint'
      const isNew  = !done && !!pulseIds && stop.bookingId && pulseIds.has(String(stop.bookingId))

      // Endpoint → "E", completed → checkmark, others → 1-based position
      let label = done ? '✓' : isEndpoint ? 'E' : String(i + 1)

      // Determine color: gray if done, blue if active, endpoint is purple, pickup is green, dropoff is red
      let bgColor
      if (done) bgColor = '#9ca3af'
      else if (active) bgColor = '#2563eb'
      else if (isEndpoint) bgColor = '#7c3aed'
      else bgColor = stop.stopType === 'pickup' ? '#16a34a' : '#dc2626'

      const el = document.createElement('div')
      const baseShadow = active ? '0 0 0 4px rgba(37,99,235,0.35)' : '0 2px 6px rgba(0,0,0,.3)'
      el.style.cssText = `
        width:34px;height:34px;border-radius:50%;
        background:${bgColor};
        color:#fff;font-size:${done ? '16px' : '13px'};font-weight:700;
        display:flex;align-items:center;justify-content:center;
        box-shadow:${baseShadow};
        border:2px solid #fff;opacity:${done ? 0.5 : 1};
        ${isNew ? 'animation:driverMapPulse 1s ease-out infinite;' : ''}
      `
      el.textContent = label

      const stopTypeLabel = stop.stopType === 'endpoint' ? '🟣 End Point' : stop.stopType === 'pickup' ? '🟢 Pickup' : '🔴 Drop-off'

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([stop.coordinates.lng, stop.coordinates.lat])
        .setPopup(new mapboxgl.Popup({ offset: 20, closeButton: false }).setHTML(
          `<div style="font-size:12px;font-weight:600">${stopTypeLabel}${isNew ? ' <span style="color:#d97706">• NEW</span>' : ''}</div>
           <div style="font-size:11px;color:#555;margin-top:2px">${stop.address}</div>`
        ))
        .addTo(map)
      markersRef.current.push(marker)
    })
  }, [])
  // Keep the ref in sync so the early useEffect (above the declaration) can
  // call through the ref without hitting a temporal dead zone.
  renderStopMarkersRef.current = renderStopMarkers

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

      // Centre on driver GPS first — fall back to first stop if GPS not yet resolved
      const initPos = driverPosRef.current
      const initCenter = initPos
        ? [initPos.lng, initPos.lat]
        : activeStop
          ? [activeStop.coordinates.lng, activeStop.coordinates.lat]
          : [74.2010, 32.6420]

      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: initCenter,
        zoom: 15,
      })
      mapRef.current = map

      const geolocate = new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,   // shows the blue heading arc
        showUserLocation: true,  // shows the native blue dot (we keep our car marker too)
      })
      // Place above the bottom sheet — bottom-right with CSS offset via mapboxgl-ctrl-bottom-right
      map.addControl(geolocate, 'top-right')
      map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right')

      map.on('load', () => {
        const i    = activeStopIndexRef.current
        const stps = routeRef.current?.optimizedStops ?? []
        renderStopMarkers(map, stps, mapboxgl, i, newStopIdsRef.current)
        renderFullRouteGray(map, routeRef.current?.encodedPolyline)

        const pos      = driverPosRef.current
        const nextStop = stps[i]
        if (nextStop) {
          const fromLng = pos?.lng ?? nextStop.coordinates.lng
          const fromLat = pos?.lat ?? nextStop.coordinates.lat
          if (pos) updateDriverMarker(map, mapboxgl, fromLng, fromLat, null)
          renderActiveLeg(map, fromLng, fromLat, nextStop, true)
        }

        geolocate.trigger()
      })

      // Unlock follow mode when the driver manually drags the map
      map.on('dragstart', () => {
        if (followDriverRef.current) {
          followDriverRef.current = false
          setFollowDriver(false)
        }
      })

      // GPS tick handler: purely LOCAL updates (car marker + turn banner + off-route timer).
      // No Mapbox Directions refetch here — the step list cached on the first render
      // is authoritative; updateTurnBanner advances through it using Haversine.
      // The off-route detector will trigger a full /reroute when the driver genuinely
      // leaves the corridor, which is the only path that produces a new Directions call.
      geolocate.on('geolocate', (e) => {
        const { longitude: lng, latitude: lat, heading } = e.coords
        driverPosRef.current = { lng, lat }

        updateDriverMarker(map, mapboxgl, lng, lat, heading)
        updateTurnBanner(lng, lat)
        checkOffRoute(lng, lat)

        // Arrival detection — announce once when driver enters ARRIVAL_RADIUS_M of the active stop
        const idx         = activeStopIndexRef.current
        const activeStop  = routeRef.current?.optimizedStops?.[idx]
        if (
          activeStop &&
          activeStop.stopType !== 'endpoint' &&
          !activeStop.completedAt &&
          arrivedStopRef.current !== idx
        ) {
          const dist = haversineM({ lat, lng }, { lat: activeStop.coordinates.lat, lng: activeStop.coordinates.lng })
          if (dist <= ARRIVAL_RADIUS_M) {
            arrivedStopRef.current = idx
            onArrivalRef.current?.(idx)
          }
        }

        // Auto-pan to keep driver centered when follow is locked
        if (followDriverRef.current) {
          map.easeTo({ center: [lng, lat], duration: 300, easing: (t) => t })
        }
      })
    })

    return () => {
      legAbortRef.current?.abort()
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
    renderStopMarkers(map, stops, mapboxgl, activeStopIndex, newStopIdsRef.current)

    const nextStop = stops[activeStopIndex]
    if (nextStop) {
      map.flyTo({ center: [nextStop.coordinates.lng, nextStop.coordinates.lat], zoom: 15, duration: 900 })
      const pos     = driverPosRef.current
      const fromLng = pos?.lng ?? nextStop.coordinates.lng
      const fromLat = pos?.lat ?? nextStop.coordinates.lat
      // New destination — reset step tracking
      renderActiveLeg(map, fromLng, fromLat, nextStop, true)
    } else {
      setBanner(null)
      if (map.getLayer('route-active')) map.removeLayer('route-active')
      if (map.getSource('route-active')) map.removeSource('route-active')
    }
  }, [activeStopIndex])

  return (
    <div className="w-full h-full relative">
      <style jsx global>{`
        @keyframes driverMapPulse {
          0%   { box-shadow: 0 0 0 0 rgba(245,158,11,0.75), 0 2px 6px rgba(0,0,0,.3); }
          70%  { box-shadow: 0 0 0 14px rgba(245,158,11,0), 0 2px 6px rgba(0,0,0,.3); }
          100% { box-shadow: 0 0 0 0 rgba(245,158,11,0), 0 2px 6px rgba(0,0,0,.3); }
        }
      `}</style>
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

      {/* ── Re-centre / follow-lock button ─────────────────────────────────
           Blue filled  = following (locked)  — tap to snap back to driver
           White        = unlocked (driver panned away) — tap to re-lock     */}
      <button
        onClick={handleUseCurrentLocation}
        disabled={locating}
        title={followDriver ? 'Following your location' : 'Re-centre on my location'}
        className="absolute bottom-4 left-3 z-30 w-11 h-11 rounded-full shadow-lg border flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background:   followDriver ? '#2563eb' : '#ffffff',
          borderColor:  followDriver ? '#1d4ed8' : '#d1d5db',
          color:        followDriver ? '#ffffff'  : '#2563eb',
        }}
      >
        {locating ? (
          <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="25 10" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2"  x2="12" y2="6"  />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2"  y1="12" x2="6"  y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        )}
      </button>
    </div>
  )
}
