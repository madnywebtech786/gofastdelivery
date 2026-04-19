import { findActiveRoute, updateRoute } from '@/lib/db/drivers'
import { pushRouteUpdate } from '@/lib/pusher'
import redis from '@/lib/redis'
import { checkBudget, MapboxBudgetError } from '@/lib/mapbox-budget'
import { hydrateRouteItems } from './hydrate'

const MAPBOX_API = 'https://api.mapbox.com'
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

async function mapboxOptimizeOrder(driverLat, driverLng, stops, endPoint = null) {
  await checkBudget('optimization')
  const token = getToken()
  const allCoords = [
    { lng: driverLng, lat: driverLat },
    ...stops.map((s) => ({ lng: s.coordinates.lng, lat: s.coordinates.lat })),
    ...(endPoint ? [{ lng: endPoint.lng, lat: endPoint.lat }] : []),
  ]
  const coordStr = allCoords.map((c) => `${c.lng},${c.lat}`).join(';')
  const url = new URL(`${MAPBOX_API}/optimized-trips/v1/mapbox/driving/${encodeURIComponent(coordStr)}`)
  url.searchParams.set('access_token', token)
  url.searchParams.set('geometries', 'polyline6')
  url.searchParams.set('overview', 'full')

  if (endPoint) {
    url.searchParams.set('roundtrip', 'false')
    url.searchParams.set('source', 'first')
    url.searchParams.set('destination', 'last')
  } else {
    url.searchParams.set('roundtrip', 'true')
  }

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) throw new Error(`Mapbox Optimization error ${res.status}`)
  const data = await res.json()
  if (data.code !== 'Ok' || !data.trips?.length) {
    throw new Error(`Mapbox Optimization bad response: code=${data.code}`)
  }

  const visitOrder = data.waypoints
    .map((w, inputIndex) => ({ inputIndex, visitPos: w.waypoint_index }))
    .sort((a, b) => a.visitPos - b.visitPos)
    .map((w) => w.inputIndex)

  let stopOrder
  if (endPoint) {
    stopOrder = visitOrder.filter((idx) => idx > 0 && idx <= stops.length).map((idx) => idx - 1)
  } else {
    const driverVisitPos = visitOrder.indexOf(0)
    const rotated = [
      ...visitOrder.slice(driverVisitPos + 1),
      ...visitOrder.slice(0, driverVisitPos),
    ]
    stopOrder = rotated.filter((idx) => idx > 0).map((idx) => idx - 1)
  }
  return stopOrder
}

async function getDirectionsPolyline(coords) {
  await checkBudget('directions')
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
    encodedPolyline:  route.geometry,
    distanceMeters:   Math.round(route.distance),
    durationSeconds:  Math.round(route.duration),
  }
}

/**
 * Re-optimize the driver's active route given their current GPS.
 *
 * Completed stops stay frozen at the front of optimizedStops.
 * Only non-completed, non-endpoint stops are fed into the optimizer.
 * Endpoint (if present) is always placed last.
 *
 * Returns the updated route doc, or null if no route / nothing to reorder.
 */
export async function reoptimizeRoute({ driverId, currentLng, currentLat, endPointOverride = null }) {
  const route = await findActiveRoute(driverId)
  if (!route) return null

  const allStops = route.optimizedStops ?? []
  const completedStops = allStops.filter((s) => s.completedAt)
  const pendingStops   = allStops.filter((s) => !s.completedAt && s.stopType !== 'endpoint')
  const existingEndpoint = allStops.find((s) => s.stopType === 'endpoint' && !s.completedAt)

  if (pendingStops.length < 1) return null

  const endPoint = endPointOverride
    ?? (existingEndpoint
      ? { lng: existingEndpoint.coordinates.lng, lat: existingEndpoint.coordinates.lat, address: existingEndpoint.address }
      : route.endPoint ?? null)

  // 1 stop: nothing to reorder, but we may still need to add/refresh endpoint
  let stopOrder
  if (pendingStops.length === 1) {
    stopOrder = [0]
  } else if (pendingStops.length <= MAPBOX_MAX_STOPS) {
    try {
      stopOrder = await mapboxOptimizeOrder(currentLat, currentLng, pendingStops, endPoint)
    } catch (err) {
      if (err instanceof MapboxBudgetError) {
        console.warn(`[reoptimize] budget tripped (${err.scope}) — falling back to nearest-neighbour`)
      }
      stopOrder = nearestNeighbourOrder(currentLat, currentLng, pendingStops)
    }
  } else {
    stopOrder = nearestNeighbourOrder(currentLat, currentLng, pendingStops)
  }

  const reorderedPending = stopOrder.map((origIdx, visitOrder) => ({
    ...pendingStops[origIdx],
    stopIndex:     completedStops.length + visitOrder,
    originalIndex: pendingStops[origIdx].originalIndex,
  }))

  let newOptimizedStops = [...completedStops, ...reorderedPending]
  if (endPoint) {
    newOptimizedStops.push({
      bookingId:      null,
      stopType:       'endpoint',
      assignmentKind: null,
      coordinates:    { lng: endPoint.lng, lat: endPoint.lat },
      address:        endPoint.address || `${endPoint.lat.toFixed(4)}, ${endPoint.lng.toFixed(4)}`,
      stopIndex:      newOptimizedStops.length,
      completedAt:    null,
    })
  }

  let encodedPolyline  = route.encodedPolyline ?? null
  let distanceMeters   = route.totalDistanceMeters ?? null
  let durationSeconds  = route.totalDurationSeconds ?? null
  try {
    const dirCoords = [
      { lng: currentLng, lat: currentLat },
      ...reorderedPending.map((s) => ({ lng: s.coordinates.lng, lat: s.coordinates.lat })),
      ...(endPoint ? [{ lng: endPoint.lng, lat: endPoint.lat }] : []),
    ]
    const dir = await getDirectionsPolyline(dirCoords)
    encodedPolyline  = dir.encodedPolyline
    distanceMeters   = dir.distanceMeters
    durationSeconds  = dir.durationSeconds
  } catch (err) {
    if (err instanceof MapboxBudgetError) {
      console.warn(`[reoptimize] directions budget tripped (${err.scope}) — keeping existing polyline`)
    }
    // Keep existing polyline on failure
  }

  await updateRoute(String(route._id), {
    optimizedStops:       newOptimizedStops,
    encodedPolyline,
    totalDistanceMeters:  distanceMeters,
    totalDurationSeconds: durationSeconds,
    endPoint:             endPoint ?? null,
  })

  const updatedRoute = {
    ...JSON.parse(JSON.stringify(route)),
    optimizedStops:       newOptimizedStops,
    encodedPolyline,
    totalDistanceMeters:  distanceMeters,
    totalDurationSeconds: durationSeconds,
    endPoint:             endPoint ?? null,
  }

  // Hydrate packageItems onto stops before caching / pushing so the driver
  // UI can render the item checklist immediately without a second round-trip,
  // and route-data cache hits need no extra DB queries.
  const hydrated = await hydrateRouteItems(updatedRoute)

  try {
    await redis.set(`driver:${driverId}:route`, hydrated, { ex: 300 })
  } catch {
    // Cache write failed — best-effort delete so the next read falls through to
    // MongoDB instead of serving whatever stale payload was previously cached.
    try { await redis.del(`driver:${driverId}:route`) } catch { /* swallow */ }
  }

  try { await pushRouteUpdate(driverId, hydrated) } catch { /* non-fatal */ }

  return hydrated
}
