'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

// How far off-corridor (metres) before we consider the driver off-route
const OFF_ROUTE_THRESHOLD_M  = 300
// How long (ms) the driver must stay off-route before we trigger a reroute
const OFF_ROUTE_DURATION_MS  = 15000
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

/**
 * Decode a Polyline5-encoded string to [[lng, lat], ...] (GeoJSON order).
 * Google Maps JS API uses precision 5 (1e5). This replaces the @mapbox/polyline
 * import which used precision 6 (1e6).
 */
function decodePolyline5(encoded) {
  const coords = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let b, shift = 0, result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1
    coords.push([lng / 1e5, lat / 1e5]) // GeoJSON order [lng, lat]
  }
  return coords
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
  const mapsLibRef         = useRef(null) // google.maps namespace
  const markerLibRef       = useRef(null) // google.maps.marker namespace
  const markersRef         = useRef([])   // AdvancedMarkerElement[]
  const driverMarkerRef    = useRef(null) // AdvancedMarkerElement for car
  const infoWindowRef      = useRef(null) // shared InfoWindow for stop popups

  // Full-route gray polyline and active-leg blue polyline (google.maps.Polyline)
  const fullPolylineRef    = useRef(null)
  const activePolylineRef  = useRef(null)

  // Current heading in degrees (0=North). Updated from GPS heading OR computed bearing.
  const headingRef         = useRef(0)
  // Previous position — used to compute bearing when GPS heading is null
  const prevPosRef         = useRef(null)
  // Inner div we rotate for the car marker (Google sets transform on the outer element)
  const carInnerRef        = useRef(null)

  const activeStopIndexRef = useRef(activeStopIndex)
  const driverPosRef       = useRef(driverPos)
  const routeRef           = useRef(route)
  const onStepUpdateRef    = useRef(onStepUpdate)
  const onRerouteRef       = useRef(onReroute)
  const onArrivalRef       = useRef(onArrival)
  const driverIdRef        = useRef(driverId)
  const newStopIdsRef      = useRef(newStopIds)

  // Ref so the newStopIds useEffect below can call renderStopMarkers before the
  // useCallback declaration is evaluated (avoids temporal-dead-zone error).
  const renderStopMarkersRef = useRef(null)

  // Turn-by-turn state
  const stepsRef           = useRef([])
  const nextStepIdxRef     = useRef(0)
  const lastSpokenStepRef  = useRef(-1)

  // Active leg corridor coords [[lng,lat],...] for off-route detection
  const corridorCoordsRef  = useRef([])
  const legAbortRef        = useRef(null)

  // Off-route tracking
  const offRouteSinceRef   = useRef(null)
  const reroutingRef       = useRef(false)

  // Arrival tracking
  const arrivedStopRef     = useRef(-1)

  // watchPosition watch ID — cleaned up on unmount
  const watchIdRef         = useRef(null)

  // ── Sync refs ─────────────────────────────────────────────────────────────
  useEffect(() => {
    activeStopIndexRef.current = activeStopIndex
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

  // Re-render markers when new stop pulse set changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !markerLibRef.current) return
    if (!renderStopMarkersRef.current) return
    const stops = routeRef.current?.optimizedStops ?? []
    renderStopMarkersRef.current(map, stops, activeStopIndexRef.current, newStopIds)
  }, [newStopIds])

  // ── Camera follow state ───────────────────────────────────────────────────
  const [followDriver, setFollowDriver] = useState(true)
  const followDriverRef = useRef(true)

  // ── Banner state ──────────────────────────────────────────────────────────
  const [banner, setBanner] = useState(null) // { icon, instruction, distance }
  const [offRoute, setOffRoute] = useState(false)
  const [locating, setLocating] = useState(false)

  // ── Full route gray polyline ──────────────────────────────────────────────
  const renderFullRouteGray = useCallback((map, enc) => {
    if (!map || !enc || !mapsLibRef.current) return
    const path = decodePolyline5(enc).map(([lng, lat]) => ({ lat, lng }))

    if (fullPolylineRef.current) fullPolylineRef.current.setMap(null)
    fullPolylineRef.current = new mapsLibRef.current.Polyline({
      path,
      map,
      strokeColor:   '#d1d5db',
      strokeWeight:  4,
      strokeOpacity: 0.8,
    })
  }, [])

  // ── Active leg in blue + extract steps ───────────────────────────────────
  // Fires only when driver switches destination, reroutes, or map first mounts.
  // No periodic GPS-tick refetch — turn steps are advanced locally via Haversine.
  const renderActiveLeg = useCallback(async (map, fromLng, fromLat, toStop, resetStepTracking = false) => {
    if (!toStop || !map || !mapsLibRef.current) return

    legAbortRef.current?.abort()
    const ctrl = new AbortController()
    legAbortRef.current = ctrl

    try {
      const res = await fetch('/api/google/directions', {
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

      // Polyline5 decode → [{ lat, lng }] for Google Maps Polyline
      const decoded = decodePolyline5(data.geometry)
      corridorCoordsRef.current = decoded // [[lng, lat]] for off-route Haversine
      const path = decoded.map(([lng, lat]) => ({ lat, lng }))

      if (activePolylineRef.current) activePolylineRef.current.setMap(null)
      activePolylineRef.current = new mapsLibRef.current.Polyline({
        path,
        map,
        strokeColor:   '#2563eb',
        strokeWeight:  6,
        strokeOpacity: 0.95,
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

    while (nextStepIdxRef.current < steps.length - 1) {
      const cur = steps[nextStepIdxRef.current]
      const [sLng, sLat] = cur.maneuver.location
      const distToStart = haversineM({ lng, lat }, { lng: sLng, lat: sLat })
      if (distToStart < 30) {
        nextStepIdxRef.current++
        if (lastSpokenStepRef.current === nextStepIdxRef.current - 1) {
          lastSpokenStepRef.current = nextStepIdxRef.current - 1
        }
        break
      }
      break
    }

    const idx  = nextStepIdxRef.current
    const step = steps[idx]
    if (!step) return

    const [sLng, sLat] = step.maneuver.location
    const distToTurn = haversineM({ lng, lat }, { lng: sLng, lat: sLat })

    setBanner({
      icon:        getManeuverIcon(step),
      instruction: step.maneuver?.instruction ?? '',
      distance:    formatDist(distToTurn),
    })

    if (distToTurn <= SPEAK_AT_M && idx !== lastSpokenStepRef.current) {
      lastSpokenStepRef.current = idx
      onStepUpdateRef.current?.(step, distToTurn)
    }
  }, [])

  // ── Re-centre + re-lock follow mode ──────────────────────────────────────
  const handleUseCurrentLocation = useCallback(() => {
    const pos = driverPosRef.current
    if (pos && mapRef.current) {
      mapRef.current.panTo({ lat: pos.lat, lng: pos.lng })
      mapRef.current.setZoom(15)
      followDriverRef.current = true
      setFollowDriver(true)
      return
    }
    if (!navigator.geolocation || !mapRef.current) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { longitude: lng, latitude: lat } = p.coords
        mapRef.current?.panTo({ lat, lng })
        mapRef.current?.setZoom(15)
        followDriverRef.current = true
        setFollowDriver(true)
        setLocating(false)
      },
      () => {
        console.warn('Geolocation permission denied')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 8000 },
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
      if (offRouteSinceRef.current !== null) {
        offRouteSinceRef.current = null
        setOffRoute(false)
      }
    }
  }, [])

  // ── Driver car marker with heading ────────────────────────────────────────
  const updateDriverMarker = useCallback((map, lng, lat, gpsHeading) => {
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
      driverMarkerRef.current.position = { lat, lng }
      if (carInnerRef.current) {
        carInnerRef.current.style.transform = `rotate(${deg}deg)`
      }
      return
    }

    // AdvancedMarkerElement uses a DOM element as content.
    // Outer div: the element Google positions on screen. Adding a CSS transition
    // here smooths the jump between GPS ticks.
    const el = document.createElement('div')
    el.style.cssText = 'width:36px;height:44px;cursor:pointer;'

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

    const { AdvancedMarkerElement } = markerLibRef.current
    driverMarkerRef.current = new AdvancedMarkerElement({
      map,
      position: { lat, lng },
      content:  el,
    })
  }, [])

  // ── Stop markers ─────────────────────────────────────────────────────────
  const renderStopMarkers = useCallback((map, stops, currentIndex, pulseIds) => {
    const { AdvancedMarkerElement } = markerLibRef.current ?? {}
    if (!AdvancedMarkerElement) return

    // Remove previous markers
    markersRef.current.forEach((m) => { m.map = null })
    markersRef.current = []

    if (!infoWindowRef.current && mapsLibRef.current) {
      infoWindowRef.current = new mapsLibRef.current.InfoWindow()
    }

    stops.forEach((stop, i) => {
      const done       = i < currentIndex
      const active     = i === currentIndex
      const isEndpoint = stop.stopType === 'endpoint'
      const isNew      = !done && !!pulseIds && stop.bookingId && pulseIds.has(String(stop.bookingId))

      const label = done ? '✓' : isEndpoint ? 'E' : String(i + 1)

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
        cursor:pointer;
        ${isNew ? 'animation:driverMapPulse 1s ease-out infinite;' : ''}
      `
      el.textContent = label

      const marker = new AdvancedMarkerElement({
        map,
        position: { lat: stop.coordinates.lat, lng: stop.coordinates.lng },
        content:  el,
      })

      // Show popup on click via shared InfoWindow
      const stopTypeLabel = stop.stopType === 'endpoint' ? '🟣 End Point'
        : stop.stopType === 'pickup' ? '🟢 Pickup' : '🔴 Drop-off'
      marker.addListener('click', () => {
        infoWindowRef.current.setContent(
          `<div style="font-size:12px;font-weight:600">${stopTypeLabel}${isNew ? ' <span style="color:#d97706">• NEW</span>' : ''}</div>
           <div style="font-size:11px;color:#555;margin-top:2px">${stop.address}</div>`
        )
        infoWindowRef.current.open({ anchor: marker, map })
      })

      markersRef.current.push(marker)
    })
  }, [])
  renderStopMarkersRef.current = renderStopMarkers

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!route) return
    let destroyed = false

    ;(async () => {
      try {
        const { Loader } = await import('@googlemaps/js-api-loader')
        const loader = new Loader({
          apiKey:    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
          version:   'weekly',
          libraries: ['maps', 'marker'],
        })

        const mapsLib   = await loader.importLibrary('maps')
        const markerLib = await loader.importLibrary('marker')
        if (destroyed || !containerRef.current) return

        mapsLibRef.current  = mapsLib
        markerLibRef.current = markerLib

        const { Map } = mapsLib

        const idx        = activeStopIndexRef.current
        const stops      = route.optimizedStops ?? []
        const activeStop = stops[idx] ?? stops[0]
        const initPos    = driverPosRef.current
        const initCenter = initPos
          ? { lat: initPos.lat, lng: initPos.lng }
          : activeStop
            ? { lat: activeStop.coordinates.lat, lng: activeStop.coordinates.lng }
            : { lat: 32.6420, lng: 74.2010 }

        const map = new Map(containerRef.current, {
          center:           initCenter,
          zoom:             15,
          mapId:            process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID ?? 'DEMO_MAP_ID',
          disableDefaultUI: true,
          zoomControl:      false, // driver doesn't need zoom controls
          gestureHandling:  'greedy', // single-finger pan on mobile
        })
        mapRef.current = map

        // Unlock follow mode when driver manually drags the map
        map.addListener('dragstart', () => {
          if (followDriverRef.current) {
            followDriverRef.current = false
            setFollowDriver(false)
          }
        })

        // Render initial state
        renderStopMarkers(map, stops, idx, newStopIdsRef.current)
        renderFullRouteGray(map, route.encodedPolyline)

        const nextStop = stops[idx]
        if (nextStop) {
          const pos     = initPos
          const fromLng = pos?.lng ?? nextStop.coordinates.lng
          const fromLat = pos?.lat ?? nextStop.coordinates.lat
          if (pos) updateDriverMarker(map, fromLng, fromLat, null)
          renderActiveLeg(map, fromLng, fromLat, nextStop, true)
        }

        // Direct watchPosition — fires at the raw browser GPS tick rate with no wrapper.
        // This fixes the three GeolocateControl issues: delayed turns, drifting marker,
        // failed auto-centering.
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            if (destroyed) return
            const { longitude: lng, latitude: lat, heading } = pos.coords
            driverPosRef.current = { lng, lat }

            updateDriverMarker(map, lng, lat, heading)
            updateTurnBanner(lng, lat)
            checkOffRoute(lng, lat)

            // Arrival detection
            const aidx       = activeStopIndexRef.current
            const activeStop = routeRef.current?.optimizedStops?.[aidx]
            if (
              activeStop &&
              activeStop.stopType !== 'endpoint' &&
              !activeStop.completedAt &&
              arrivedStopRef.current !== aidx
            ) {
              const dist = haversineM({ lat, lng }, {
                lat: activeStop.coordinates.lat,
                lng: activeStop.coordinates.lng,
              })
              if (dist <= ARRIVAL_RADIUS_M) {
                arrivedStopRef.current = aidx
                onArrivalRef.current?.(aidx)
              }
            }

            // Auto-pan to keep driver centered when follow is locked
            if (followDriverRef.current) {
              map.panTo({ lat, lng })
            }
          },
          (err) => {
            console.warn('[DriverMap] watchPosition error:', err)
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
        )
      } catch (err) {
        console.error('[DriverMap] Google Maps init failed:', err)
      }
    })()

    return () => {
      destroyed = true
      legAbortRef.current?.abort()
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (fullPolylineRef.current)  { fullPolylineRef.current.setMap(null);  fullPolylineRef.current = null }
      if (activePolylineRef.current){ activePolylineRef.current.setMap(null); activePolylineRef.current = null }
      markersRef.current.forEach((m) => { m.map = null })
      markersRef.current = []
      driverMarkerRef.current = null
      mapRef.current = null
    }
  }, []) // mount once

  // ── Active stop changed ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !markerLibRef.current) return

    const stops = routeRef.current?.optimizedStops ?? []
    renderStopMarkers(map, stops, activeStopIndex, newStopIdsRef.current)

    const nextStop = stops[activeStopIndex]
    if (nextStop) {
      map.panTo({ lat: nextStop.coordinates.lat, lng: nextStop.coordinates.lng })
      map.setZoom(15)
      const pos     = driverPosRef.current
      const fromLng = pos?.lng ?? nextStop.coordinates.lng
      const fromLat = pos?.lat ?? nextStop.coordinates.lat
      renderActiveLeg(map, fromLng, fromLat, nextStop, true)
    } else {
      setBanner(null)
      if (activePolylineRef.current) {
        activePolylineRef.current.setMap(null)
        activePolylineRef.current = null
      }
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
        <div className="absolute top-16 left-0 right-0 z-30 flex justify-center pointer-events-none px-3">
          <div
            className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5"
            style={{ background: 'rgba(15,23,42,0.88)', backdropFilter: 'blur(8px)', width: '62%', minWidth: '200px', maxWidth: '340px' }}
          >
            <div className="shrink-0 w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-lg font-bold text-white">
              {banner.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-xs leading-snug">{banner.instruction}</p>
              {banner.distance && (
                <p className="text-blue-300 text-[11px] font-semibold mt-0.5">{banner.distance}</p>
              )}
            </div>
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
           Blue filled = following — tap to snap back
           White       = unlocked — tap to re-lock                          */}
      <button
        onClick={handleUseCurrentLocation}
        disabled={locating}
        title={followDriver ? 'Following your location' : 'Re-centre on my location'}
        className="absolute bottom-4 left-3 z-30 w-11 h-11 rounded-full shadow-lg border flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background:  followDriver ? '#2563eb' : '#ffffff',
          borderColor: followDriver ? '#1d4ed8' : '#d1d5db',
          color:       followDriver ? '#ffffff'  : '#2563eb',
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
