import redis, { incrementWithExpiry } from '@/lib/redis'

const MAPBOX_API = 'https://api.mapbox.com'
const DAILY_DIRECTIONS_LIMIT = 1500  // Safety cap (~45k/month, well under 50k free tier)
const DAILY_MATCHING_LIMIT = 500

function getToken() {
  const token = process.env.MAPBOX_SECRET_TOKEN
  if (!token) throw new Error('MAPBOX_SECRET_TOKEN is not set')
  return token
}

/**
 * Check and increment a daily API usage counter.
 * Throws an error if the daily limit is exceeded.
 */
async function checkDailyLimit(counterKey, limit) {
  const count = await incrementWithExpiry(counterKey, 86400) // 24h TTL
  if (count > limit) {
    throw new Error(`Mapbox daily limit reached for ${counterKey}. Count: ${count}/${limit}`)
  }
}

/**
 * Get a truly optimized route using Mapbox Optimization API v1.
 * This reorders stops for the shortest total travel distance (TSP solver).
 * The first stop (pickup) is always kept first — only dropoffs are reordered.
 *
 * Called server-side only — uses secret token.
 *
 * @param {Array<{lng: number, lat: number}>} stops - Array of coordinate objects (order: pickup first)
 * @returns {{
 *   encodedPolyline: string,
 *   distanceMeters: number,
 *   durationSeconds: number,
 *   waypoint_order: number[],  // optimized index order of input stops
 * }}
 */
export async function getOptimizedRoute(stops) {
  if (stops.length < 2) throw new Error('At least 2 stops required')
  if (stops.length > 12) throw new Error('Maximum 12 stops for optimization')

  await checkDailyLimit('mapbox:daily:directions', DAILY_DIRECTIONS_LIMIT)

  const token = getToken()

  // roundtrip=true is the only mode that allows full free reordering of ALL stops.
  // roundtrip=false with source/destination locks first/last; without them → NotImplemented.
  // We use roundtrip=true purely to get the optimal waypoint order, then ignore the
  // return-to-start leg. The actual driving polyline is drawn per-leg by the client map.
  const coordinates = stops.map((s) => `${s.lng},${s.lat}`).join(';')
  const url = new URL(
    `${MAPBOX_API}/optimized-trips/v1/mapbox/driving/${encodeURIComponent(coordinates)}`
  )
  url.searchParams.set('access_token', token)
  url.searchParams.set('geometries', 'polyline6')
  url.searchParams.set('overview', 'full')
  url.searchParams.set('roundtrip', 'true')

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text()
    console.error(`[mapbox] Optimization API failed (${res.status}): ${text} — falling back to Directions (NO REORDERING)`)
    return getDirectionsRoute(stops)
  }

  const data = await res.json()
  if (data.code !== 'Ok' || !data.trips?.length) {
    console.error(`[mapbox] Optimization bad response code=${data.code} — falling back to Directions (NO REORDERING)`)
    return getDirectionsRoute(stops)
  }

  console.log('[mapbox] Optimization success, waypoint_order will be:', JSON.stringify(
    data.waypoints.map((w, i) => ({ input: i, visitPos: w.waypoint_index }))
  ))

  const trip = data.trips[0]
  // Per Mapbox Optimization v1 docs:
  //   waypoints array  = INPUT ORDER (array index = original input index)
  //   waypoint_index   = position in the OPTIMIZED trip (visit order)
  //   trips_index      = which trip object (always 0 for single trip)
  //
  // Example: waypoints = [{waypoint_index:0},{waypoint_index:2},{waypoint_index:1}]
  //   means: input[0] is visited 1st, input[1] is visited 3rd, input[2] is visited 2nd
  //
  // We need waypoint_order[visitPos] = originalInputIndex.
  // Sort waypoints by their visit position (waypoint_index), then emit the array index.
  const waypointOrder = data.waypoints
    .map((w, inputIndex) => ({ inputIndex, visitPos: w.waypoint_index }))
    .sort((a, b) => a.visitPos - b.visitPos)
    .map((w) => w.inputIndex)

  return {
    encodedPolyline: trip.geometry,
    distanceMeters: Math.round(trip.distance),
    durationSeconds: Math.round(trip.duration),
    waypoint_order: waypointOrder,
  }
}

/**
 * Fallback: Directions API (respects input order, no reordering).
 * Used when the Optimization API is unavailable or returns an error.
 */
async function getDirectionsRoute(stops) {
  const token = getToken()
  const coordinates = stops.map((s) => `${s.lng},${s.lat}`).join(';')
  const url = new URL(
    `${MAPBOX_API}/directions/v5/mapbox/driving/${encodeURIComponent(coordinates)}`
  )
  url.searchParams.set('access_token', token)
  url.searchParams.set('geometries', 'polyline6')
  url.searchParams.set('overview', 'full')

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Mapbox Directions API error ${res.status}: ${text}`)
  }

  const data = await res.json()
  if (!data.routes?.length) throw new Error('No route found by Mapbox Directions')

  const route = data.routes[0]
  return {
    encodedPolyline: route.geometry,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
    waypoint_order: stops.map((_, i) => i), // original order
  }
}

/**
 * Run Map Matching on a location trace to snap points to roads.
 * Only call this when route deviation is detected (cost-sensitive).
 *
 * @param {Array<{lng: number, lat: number, ts: number}>} points - Trace points
 * @returns {{ matchedGeometry: string, confidence: number }}
 */
export async function runMapMatching(points) {
  if (points.length < 2) throw new Error('At least 2 trace points required')
  if (points.length > 100) {
    // Subsample to max 100 points
    const step = Math.ceil(points.length / 100)
    points = points.filter((_, i) => i % step === 0)
  }

  await checkDailyLimit('mapbox:daily:matching', DAILY_MATCHING_LIMIT)

  const coordinates = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const timestamps = points.map((p) => Math.floor(p.ts / 1000)).join(';')
  const radiuses = points.map(() => '25').join(';') // 25m GPS accuracy

  const url = `${MAPBOX_API}/matching/v5/mapbox/driving/${encodeURIComponent(coordinates)}`
  const params = new URLSearchParams({
    access_token: getToken(),
    geometries: 'polyline6',
    overview: 'full',
    timestamps,
    radiuses,
    tidy: 'true',
  })

  const res = await fetch(`${url}?${params}`, { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Mapbox Map Matching API error ${res.status}: ${text}`)
  }

  const data = await res.json()
  if (!data.matchings?.length) throw new Error('No map matching result')

  const matching = data.matchings[0]
  return {
    matchedGeometry: matching.geometry,
    confidence: matching.confidence,
    distanceMeters: Math.round(matching.distance),
    durationSeconds: Math.round(matching.duration),
  }
}

/**
 * Forward geocode an address string to coordinates.
 * Used server-side for address validation.
 */
export async function geocodeAddress(address) {
  await checkDailyLimit('mapbox:daily:geocoding', 5000)

  const url = new URL(`${MAPBOX_API}/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`)
  url.searchParams.set('access_token', getToken())
  url.searchParams.set('limit', '1')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Mapbox Geocoding error ${res.status}`)

  const data = await res.json()
  if (!data.features?.length) return null

  const [lng, lat] = data.features[0].center
  return { lng, lat, placeName: data.features[0].place_name }
}
