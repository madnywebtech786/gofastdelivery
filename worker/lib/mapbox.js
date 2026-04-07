/**
 * mapbox.js — Server-side Mapbox API calls for the worker.
 * All calls use the secret token (sk.*) — never exposed to client.
 */

const MAPBOX_API = 'https://api.mapbox.com'

function getToken() {
  const token = process.env.MAPBOX_SECRET_TOKEN
  if (!token) throw new Error('MAPBOX_SECRET_TOKEN is not set')
  return token
}

/**
 * Map Matching API — snaps a GPS trace to the road network.
 * Only called when deviation is confirmed (cost-sensitive).
 *
 * @param {Array<{lat, lng, ts}>} points — GPS trace (2–100 points)
 * @returns {{ matchedGeometry: string, distanceMeters: number, durationSeconds: number, confidence: number }}
 */
export async function runMapMatching(points) {
  if (!points || points.length < 2) throw new Error('At least 2 points required for map matching')

  // Mapbox Map Matching supports max 100 points
  if (points.length > 100) {
    const step = Math.ceil(points.length / 100)
    points = points.filter((_, i) => i % step === 0)
  }

  const coordinates = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const timestamps = points.map((p) => Math.floor(p.ts / 1000)).join(';')
  const radiuses = points.map(() => '25').join(';') // 25m GPS accuracy radius

  const url = `${MAPBOX_API}/matching/v5/mapbox/driving/${encodeURIComponent(coordinates)}`
  const params = new URLSearchParams({
    access_token: getToken(),
    geometries: 'polyline6',
    overview: 'full',
    timestamps,
    radiuses,
    tidy: 'true',
  })

  const res = await fetch(`${url}?${params}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Mapbox Map Matching error ${res.status}: ${text}`)
  }

  const data = await res.json()
  if (!data.matchings?.length) throw new Error('No map matching result returned')

  const matching = data.matchings[0]
  return {
    matchedGeometry: matching.geometry,
    confidence: matching.confidence,
    distanceMeters: Math.round(matching.distance),
    durationSeconds: Math.round(matching.duration),
  }
}

/**
 * Directions API — compute optimized route for remaining stops.
 *
 * @param {Array<{lng, lat}>} stops
 * @returns {{ encodedPolyline, distanceMeters, durationSeconds, legs }}
 */
export async function getOptimizedRoute(stops) {
  if (!stops || stops.length < 2) throw new Error('At least 2 stops required')
  if (stops.length > 25) throw new Error('Maximum 25 stops supported')

  const coordinates = stops.map((s) => `${s.lng},${s.lat}`).join(';')
  const url = new URL(
    `${MAPBOX_API}/directions/v5/mapbox/driving/${encodeURIComponent(coordinates)}`
  )
  url.searchParams.set('access_token', getToken())
  url.searchParams.set('geometries', 'polyline6')
  url.searchParams.set('overview', 'full')
  url.searchParams.set('steps', 'true')

  const res = await fetch(url.toString())
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Mapbox Directions error ${res.status}: ${text}`)
  }

  const data = await res.json()
  if (!data.routes?.length) throw new Error('No route found')

  const route = data.routes[0]
  return {
    encodedPolyline: route.geometry,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
    legs: route.legs,
  }
}
