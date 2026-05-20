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

/**
 * Enforce pickup-before-dropoff for pickup_and_dropoff bookings.
 * If Mapbox returns (or fallback produces) an order where a dropoff appears
 * before its paired pickup, swap the two positions.
 * Applied after optimization so we never break the API's overall optimality
 * except for the mandatory constraint.
 */
function enforcePrecedence(stopOrder, stops) {
  const order = [...stopOrder]
  for (let i = 0; i < order.length; i++) {
    const s = stops[order[i]]
    if (s.stopType !== 'dropoff' || s.assignmentKind !== 'pickup_and_dropoff') continue
    const pickupPos = order.findIndex(
      (idx) => stops[idx].stopType === 'pickup' && stops[idx].bookingId === s.bookingId && stops[idx].assignmentKind === 'pickup_and_dropoff'
    )
    if (pickupPos !== -1 && pickupPos > i) {
      // Dropoff is before its pickup — swap them
      ;[order[i], order[pickupPos]] = [order[pickupPos], order[i]]
    }
  }
  return order
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
  const url = new URL(`${MAPBOX_API}/optimized-trips/v1/mapbox/driving/${coordStr}`)
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

  // Build distributions for pickup_and_dropoff bookings so Mapbox guarantees
  // pickup is visited before its corresponding dropoff.
  // stops[] indices are 0-based; allCoords adds 1 for the driver at index 0.
  const distributionPairs = []
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i]
    if (s.stopType === 'pickup' && s.assignmentKind === 'pickup_and_dropoff') {
      const dropoffIdx = stops.findIndex(
        (t, j) => j !== i && t.stopType === 'dropoff' && t.bookingId === s.bookingId && t.assignmentKind === 'pickup_and_dropoff'
      )
      if (dropoffIdx !== -1) {
        // +1 because allCoords[0] is the driver position
        distributionPairs.push(`${i + 1},${dropoffIdx + 1}`)
      }
    }
  }
  if (distributionPairs.length > 0) {
    url.searchParams.set('distributions', distributionPairs.join(';'))
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
  const url = new URL(`${MAPBOX_API}/directions/v5/mapbox/driving/${coordStr}`)
  url.searchParams.set('access_token', token)
  url.searchParams.set('geometries', 'polyline6')
  url.searchParams.set('overview', 'full')
  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) throw new Error(`Mapbox Directions error ${res.status}`)
  const data = await res.json()
  if (!data.routes?.length) throw new Error('No route found')
  const route = data.routes[0]
  // legs[i].duration = seconds to travel from coord[i] to coord[i+1]
  // coords[0] is driver position, coords[1..n] are stops in order
  // So legs[0] = driver→stop[0], legs[1] = stop[0]→stop[1], etc.
  const legDurations = (route.legs ?? []).map((leg) => Math.round(leg.duration))
  return {
    encodedPolyline:  route.geometry,
    distanceMeters:   Math.round(route.distance),
    durationSeconds:  Math.round(route.duration),
    legDurations,
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
      // Mapbox enforces pickup-before-dropoff natively via distributions — no post-processing needed
    } catch (err) {
      if (err instanceof MapboxBudgetError) {
        console.warn(`[reoptimize] budget tripped (${err.scope}) — falling back to nearest-neighbour`)
      }
      // Fallback: nearest-neighbour has no constraint support, enforce manually
      stopOrder = enforcePrecedence(nearestNeighbourOrder(currentLat, currentLng, pendingStops), pendingStops)
    }
  } else {
    // Over Mapbox limit: nearest-neighbour fallback, enforce manually
    stopOrder = enforcePrecedence(nearestNeighbourOrder(currentLat, currentLng, pendingStops), pendingStops)
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

  // Will be populated from Directions leg durations below
  // legDurations[0] = driver→stop[0], legDurations[k] = stop[k-1]→stop[k]
  // Only pending+endpoint stops are in the Directions call, so we annotate
  // only those stops; completed stops keep their existing estimatedArrivalAt.
  let legDurations = []

  const dirCoords = [
    { lng: currentLng, lat: currentLat },
    ...reorderedPending.map((s) => ({ lng: s.coordinates.lng, lat: s.coordinates.lat })),
    ...(endPoint ? [{ lng: endPoint.lng, lat: endPoint.lat }] : []),
  ]

  try {
    const dir = await getDirectionsPolyline(dirCoords)
    encodedPolyline  = dir.encodedPolyline
    distanceMeters   = dir.distanceMeters
    durationSeconds  = dir.durationSeconds
    legDurations     = dir.legDurations ?? []
  } catch (err) {
    if (err instanceof MapboxBudgetError) {
      console.warn(`[reoptimize] directions budget tripped (${err.scope}) — keeping existing polyline`)
    }
    // Keep existing polyline on failure
  }

  // If Directions API failed or returned no leg durations, estimate from
  // haversine distances at 40 km/h average urban driving speed.
  if (legDurations.length === 0 && dirCoords.length >= 2) {
    const AVG_SPEED_KMH = 40
    legDurations = []
    for (let k = 0; k < dirCoords.length - 1; k++) {
      const a = dirCoords[k]
      const b = dirCoords[k + 1]
      const km = haversine(a.lat, a.lng, b.lat, b.lng)
      legDurations.push(Math.round((km / AVG_SPEED_KMH) * 3600))
    }
  }

  // Annotate each non-completed stop with an estimated arrival time.
  // dirCoords = [driver, pendingStop[0], pendingStop[1], ..., endPoint?]
  // legDurations[k] = seconds from dirCoords[k] to dirCoords[k+1]
  // newOptimizedStops = [...completedStops, ...reorderedPending, endpointStop?]
  // So for newOptimizedStops[j] (j >= completedStops.length), leg index = j - completedStops.length
  if (legDurations.length > 0) {
    const now = Date.now()
    let cumulativeMs = 0
    const offset = completedStops.length
    for (let j = offset; j < newOptimizedStops.length; j++) {
      const legIdx = j - offset  // 0 = driver→first pending, 1 = first→second, etc.
      cumulativeMs += (legDurations[legIdx] ?? 0) * 1000
      newOptimizedStops[j] = {
        ...newOptimizedStops[j],
        estimatedArrivalAt: new Date(now + cumulativeMs).toISOString(),
      }
    }
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
