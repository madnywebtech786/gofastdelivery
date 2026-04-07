import { NextResponse } from 'next/server'
import { requireDriver, handleApiError } from '@/lib/dal'
import { findActiveRoute, updateRoute } from '@/lib/db/drivers'
import { pushRouteUpdate } from '@/lib/pusher'
import redis from '@/lib/redis'

const MAPBOX_API = 'https://api.mapbox.com'

// Mapbox Optimization v1 supports max 12 waypoints total (including driver position)
// So max 11 stops can be truly optimized. Above that we fall back to nearest-neighbour.
const MAPBOX_MAX_STOPS = 11

function getToken() {
  const token = process.env.MAPBOX_SECRET_TOKEN
  if (!token) throw new Error('MAPBOX_SECRET_TOKEN not set')
  return token
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
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
 * Greedy nearest-neighbour sort.
 * Used when stops <= 2 (Mapbox can't reorder 2 stops anyway)
 * or when stops > MAPBOX_MAX_STOPS (outside Mapbox limit).
 * Returns pending stop indices in visit order.
 */
function nearestNeighbourOrder(driverLat, driverLng, stops) {
  const remaining = stops.map((_, i) => i)
  const order = []
  let curLat = driverLat
  let curLng = driverLng

  while (remaining.length > 0) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const s = stops[remaining[i]]
      const d = haversine(curLat, curLng, s.coordinates.lat, s.coordinates.lng)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    const chosen = remaining.splice(bestIdx, 1)[0]
    order.push(chosen)
    curLat = stops[chosen].coordinates.lat
    curLng = stops[chosen].coordinates.lng
  }

  return order
}

/**
 * Mapbox Optimization API v1 — roundtrip=true with rotation trick.
 *
 * coords[0] = driver position. Mapbox freely optimizes the full loop.
 * We find where the driver lands in the optimized visit order, then rotate
 * the array to start from the next stop — giving the true shortest path
 * from the driver's position through all stops.
 *
 * Returns pending stop indices (0-based into the pendingStops array) in visit order.
 */
async function mapboxOptimizeOrder(driverLat, driverLng, stops) {
  const token = getToken()

  const allCoords = [
    { lng: driverLng, lat: driverLat },
    ...stops.map((s) => ({ lng: s.coordinates.lng, lat: s.coordinates.lat })),
  ]

  const coordStr = allCoords.map((c) => `${c.lng},${c.lat}`).join(';')
  const url = new URL(
    `${MAPBOX_API}/optimized-trips/v1/mapbox/driving/${encodeURIComponent(coordStr)}`
  )
  url.searchParams.set('access_token', token)
  url.searchParams.set('geometries', 'polyline6')
  url.searchParams.set('overview', 'full')
  url.searchParams.set('roundtrip', 'true')

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Mapbox Optimization error ${res.status}: ${text}`)
  }

  const data = await res.json()
  if (data.code !== 'Ok' || !data.trips?.length) {
    throw new Error(`Mapbox Optimization bad response: code=${data.code}`)
  }

  // visitOrder[i] = input index of the stop visited at position i
  const visitOrder = data.waypoints
    .map((w, inputIndex) => ({ inputIndex, visitPos: w.waypoint_index }))
    .sort((a, b) => a.visitPos - b.visitPos)
    .map((w) => w.inputIndex)

  console.log('[reroute] Mapbox visitOrder:', visitOrder)

  // Find driver position (inputIndex=0) in the loop, rotate to start after it
  const driverVisitPos = visitOrder.indexOf(0)
  const rotated = [
    ...visitOrder.slice(driverVisitPos + 1),
    ...visitOrder.slice(0, driverVisitPos),
  ]

  // Strip driver entry (inputIndex=0), shift remaining: inputIndex i → stop index i-1
  const stopOrder = rotated.filter((idx) => idx > 0).map((idx) => idx - 1)

  console.log('[reroute] Mapbox stop order after rotation:', stopOrder)
  return stopOrder
}

/**
 * Fetch a driving polyline from Mapbox Directions for an already-ordered list of coords.
 * Mapbox Directions supports up to 25 waypoints.
 */
async function getDirectionsPolyline(coords) {
  const token = getToken()
  const coordStr = coords.map((c) => `${c.lng},${c.lat}`).join(';')
  const url = new URL(`${MAPBOX_API}/directions/v5/mapbox/driving/${encodeURIComponent(coordStr)}`)
  url.searchParams.set('access_token', token)
  url.searchParams.set('geometries', 'polyline6')
  url.searchParams.set('overview', 'full')

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) throw new Error(`Mapbox Directions error ${res.status}`)
  const data = await res.json()
  if (!data.routes?.length) throw new Error('No route found')

  const route = data.routes[0]
  return {
    encodedPolyline: route.geometry,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
  }
}

/**
 * POST /api/drivers/[driverId]/reroute
 * Body: { currentLng: number, currentLat: number }
 *
 * Ordering strategy by stop count:
 *   1 stop  → no reorder needed
 *   2 stops → nearest-neighbour (Mapbox cannot reorder 2 stops — only 1 possible order)
 *   3–11    → Mapbox Optimization API (true TSP, globally optimal)
 *   12+     → nearest-neighbour (outside Mapbox v1 limit)
 *
 * After ordering, Mapbox Directions is called for the actual road polyline.
 */
export async function POST(request, { params }) {
  try {
    const { driverId } = await params
    const { userId } = await requireDriver()

    if (driverId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { currentLng, currentLat } = await request.json()
    if (currentLng == null || currentLat == null) {
      return NextResponse.json({ error: 'currentLng and currentLat are required' }, { status: 400 })
    }

    const route = await findActiveRoute(driverId)
    if (!route) {
      return NextResponse.json({ error: 'No active route' }, { status: 404 })
    }

    const allStops = route.optimizedStops ?? []
    const completedStops = allStops.filter((s) => s.completedAt)
    const pendingStops   = allStops.filter((s) => !s.completedAt)

    if (pendingStops.length < 1) {
      return NextResponse.json({ error: 'No pending stops to reroute' }, { status: 400 })
    }

    // 1 stop — nothing to reorder
    if (pendingStops.length === 1) {
      return NextResponse.json({ route: JSON.parse(JSON.stringify(route)), rerouted: false })
    }

    // Choose ordering strategy
    let stopOrder

    if (pendingStops.length <= MAPBOX_MAX_STOPS) {
      // 2–11 stops: try Mapbox Optimization for global optimum
      // But with exactly 2 stops Mapbox cannot reorder (only 1 path exists),
      // so fall through to nearest-neighbour on failure or when order is trivial
      try {
        stopOrder = await mapboxOptimizeOrder(currentLat, currentLng, pendingStops)
      } catch (err) {
        console.warn('[reroute] Mapbox Optimization failed, falling back to nearest-neighbour:', err.message)
        stopOrder = nearestNeighbourOrder(currentLat, currentLng, pendingStops)
      }
    } else {
      // 12+ stops: nearest-neighbour (fast, free, good enough for large sets)
      console.log(`[reroute] ${pendingStops.length} stops — using nearest-neighbour (exceeds Mapbox limit)`)
      stopOrder = nearestNeighbourOrder(currentLat, currentLng, pendingStops)
    }

    console.log('[reroute] Final stop order:', stopOrder)

    // Rebuild pending stops in optimized order
    const reorderedPending = stopOrder.map((origPendingIdx, newVisitOrder) => ({
      ...pendingStops[origPendingIdx],
      stopIndex: completedStops.length + newVisitOrder,
      originalIndex: pendingStops[origPendingIdx].originalIndex,
    }))

    const newOptimizedStops = [...completedStops, ...reorderedPending]

    // Fetch driving polyline for the ordered route
    let encodedPolyline = route.encodedPolyline ?? null
    let distanceMeters = route.totalDistanceMeters ?? null
    let durationSeconds = route.totalDurationSeconds ?? null

    try {
      const dirCoords = [
        { lng: currentLng, lat: currentLat },
        ...reorderedPending.map((s) => ({ lng: s.coordinates.lng, lat: s.coordinates.lat })),
      ]
      const dir = await getDirectionsPolyline(dirCoords)
      encodedPolyline = dir.encodedPolyline
      distanceMeters = dir.distanceMeters
      durationSeconds = dir.durationSeconds
    } catch (err) {
      console.warn('[reroute] Directions API failed, keeping existing polyline:', err.message)
    }

    await updateRoute(String(route._id), {
      optimizedStops: newOptimizedStops,
      encodedPolyline,
      totalDistanceMeters: distanceMeters,
      totalDurationSeconds: durationSeconds,
    })

    const updatedRoute = {
      ...JSON.parse(JSON.stringify(route)),
      optimizedStops: newOptimizedStops,
      encodedPolyline,
      totalDistanceMeters: distanceMeters,
      totalDurationSeconds: durationSeconds,
    }

    try { await redis.del(`driver:${driverId}:route`) } catch { /* non-fatal */ }
    try { await pushRouteUpdate(driverId, updatedRoute) } catch { /* non-fatal */ }

    return NextResponse.json({ route: updatedRoute, rerouted: true })
  } catch (err) {
    return handleApiError(err, '[POST /api/drivers/[driverId]/reroute]')
  }
}
