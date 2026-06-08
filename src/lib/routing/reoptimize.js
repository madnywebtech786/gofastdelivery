import { findActiveRoute, updateRoute } from '@/lib/db/drivers'
import { pushRouteUpdate } from '@/lib/pusher'
import redis from '@/lib/redis'
import { checkBudget, MapboxBudgetError } from '@/lib/mapbox-budget'
import { hydrateRouteItems } from './hydrate'

const MAPBOX_API = 'https://api.mapbox.com'
const ORS_API    = 'https://api.openrouteservice.org/optimization'

function getToken() {
  const token = process.env.MAPBOX_SECRET_TOKEN
  if (!token) throw new Error('MAPBOX_SECRET_TOKEN not set')
  return token
}

function getOrsKey() {
  const key = process.env.ORS_API_KEY
  if (!key) throw new Error('ORS_API_KEY not set')
  return key
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
 * Optimise stop order using Vroom via the ORS public API.
 *
 * pickup_and_dropoff bookings are submitted as Vroom "shipments" so the engine
 * enforces pickup-before-dropoff natively — no post-processing needed.
 * Standalone pickup_only / dropoff_only stops are submitted as "jobs".
 *
 * Returns an array of indices into `stops[]` in visit order.
 */
async function orsOptimizeOrder(driverLat, driverLng, stops, endPoint = null) {
  const key = getOrsKey()

  const shipments = []
  const jobs      = []

  // Track which stops have already been paired to avoid double-adding dropoffs
  const pairedDropoffIndices = new Set()

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i]

    if (s.assignmentKind === 'pickup_and_dropoff' && s.stopType === 'pickup') {
      const dropoffIdx = stops.findIndex(
        (t, j) =>
          j !== i &&
          t.stopType === 'dropoff' &&
          t.bookingId === s.bookingId &&
          t.assignmentKind === 'pickup_and_dropoff'
      )
      if (dropoffIdx !== -1) {
        pairedDropoffIndices.add(dropoffIdx)
        // Vroom shipment IDs must be unique positive integers.
        // We encode the stop index directly so we can decode the order later.
        // pickup id = i, delivery id = dropoffIdx (both globally unique per stop).
        shipments.push({
          pickup:   { id: i,          location: [stops[i].coordinates.lng,          stops[i].coordinates.lat]          },
          delivery: { id: dropoffIdx, location: [stops[dropoffIdx].coordinates.lng, stops[dropoffIdx].coordinates.lat] },
        })
        continue
      }
    }

    // Skip dropoffs already paired above
    if (pairedDropoffIndices.has(i)) continue

    // All other stops (pickup_only, dropoff_only, or unpaired) go in as jobs
    jobs.push({ id: i, location: [s.coordinates.lng, s.coordinates.lat] })
  }

  const vehicle = {
    id:      1,
    profile: 'driving-car',
    start:   [driverLng, driverLat],
  }
  if (endPoint) {
    vehicle.end = [endPoint.lng, endPoint.lat]
  }

  const payload = { vehicles: [vehicle], shipments, jobs }

  const res = await fetch(ORS_API, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': key,
    },
    body:  JSON.stringify(payload),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`ORS Optimization error ${res.status}: ${text}`)
  }

  const data = await res.json()

  const route = data.routes?.[0]
  if (!route) throw new Error('ORS returned no routes')

  // Extract stop indices from steps in visit order.
  // step.type is 'start' | 'job' | 'pickup' | 'delivery' | 'end'
  // step.id corresponds to the original stop index we encoded above.
  const stopOrder = []
  for (const step of route.steps) {
    if (step.type === 'job' || step.type === 'pickup' || step.type === 'delivery') {
      stopOrder.push(step.id)
    }
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
  const completedStops    = allStops.filter((s) => s.completedAt)
  const pendingStops      = allStops.filter((s) => !s.completedAt && s.stopType !== 'endpoint')
  const existingEndpoint  = allStops.find((s) => s.stopType === 'endpoint' && !s.completedAt)

  if (pendingStops.length < 1) return null

  const endPoint = endPointOverride
    ?? (existingEndpoint
      ? { lng: existingEndpoint.coordinates.lng, lat: existingEndpoint.coordinates.lat, address: existingEndpoint.address }
      : route.endPoint ?? null)

  // 1 stop: nothing to reorder
  let stopOrder
  if (pendingStops.length === 1) {
    stopOrder = [0]
  } else {
    try {
      stopOrder = await orsOptimizeOrder(currentLat, currentLng, pendingStops, endPoint)
    } catch (err) {
      // ORS failed — fall back to identity order (current DB order) with a warning.
      // We do not use nearest-neighbour as a fallback because it ignores
      // pickup-before-dropoff constraints for paired bookings.
      console.warn('[reoptimize] ORS optimization failed — keeping current stop order:', err.message)
      stopOrder = pendingStops.map((_, i) => i)
    }
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
