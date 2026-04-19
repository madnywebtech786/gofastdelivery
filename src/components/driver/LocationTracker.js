'use client'

import { useEffect, useRef } from 'react'

const SAMPLE_INTERVAL_MS = 5000   // Buffer 1 point every 5 seconds
const DEVIATION_THRESHOLD_M = 50  // Submit trace when >50m from route corridor

/**
 * Haversine distance between two lat/lng points in metres.
 */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Check if a point deviates more than threshold metres from any point
 * on the expected route stops array.
 */
function isDeviated(lat, lng, routeStops = [], threshold = DEVIATION_THRESHOLD_M) {
  if (!routeStops.length) return false
  return routeStops.every((stop) => {
    const d = haversineMeters(lat, lng, stop.coordinates.lat, stop.coordinates.lng)
    return d > threshold
  })
}

/**
 * LocationTracker — watches driver position and submits compressed traces
 * to /api/location when deviation is detected.
 * onDeviationDetected() is called when reroute submission happens.
 */
export default function LocationTracker({ routeId, routeStops, onDeviationDetected }) {
  const bufferRef = useRef([])
  const lastSubmitRef = useRef(0)
  const watchIdRef = useRef(null)
  const sampleTimerRef = useRef(null)
  const currentPositionRef = useRef(null)

  useEffect(() => {
    if (!navigator.geolocation) return

    // Seed currentPositionRef immediately so merge-triggered auto-reroute has
    // fresh coords without waiting for the first watchPosition callback.
    function primeImmediate() {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          currentPositionRef.current = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ts: Date.now(),
          }
        },
        () => { /* swallow — watchPosition will take over */ },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      )
    }
    primeImmediate()

    function onVisibility() {
      if (!document.hidden) primeImmediate()
    }
    document.addEventListener('visibilitychange', onVisibility)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        currentPositionRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ts: Date.now(),
        }
      },
      (err) => console.warn('[LocationTracker] geolocation error:', err),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
    )

    // Sample position every 5 seconds
    sampleTimerRef.current = setInterval(() => {
      const pos = currentPositionRef.current
      if (!pos) return

      bufferRef.current.push({ ...pos })

      // Trim buffer to last 60 samples (5 minutes of data)
      if (bufferRef.current.length > 60) {
        bufferRef.current = bufferRef.current.slice(-60)
      }

      // Check deviation
      const deviated = isDeviated(pos.lat, pos.lng, routeStops)
      const cooldown = Date.now() - lastSubmitRef.current > 60000 // 1 min cooldown between submissions

      if (deviated && cooldown && bufferRef.current.length >= 2) {
        submitTrace()
      }
    }, SAMPLE_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      clearInterval(sampleTimerRef.current)
    }
  }, [routeStops])

  async function submitTrace() {
    const points = [...bufferRef.current]
    if (!routeId || points.length < 2) return

    lastSubmitRef.current = Date.now()
    bufferRef.current = []

    try {
      const res = await fetch('/api/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId, points }),
      })
      // Only signal rerouting if the server accepted the trace
      if (res.ok) onDeviationDetected?.()
    } catch (err) {
      console.warn('[LocationTracker] Failed to submit trace:', err)
    }
  }

  return null
}
