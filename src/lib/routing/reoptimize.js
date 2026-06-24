import { findActiveRoute, updateRoute } from '@/lib/db/drivers'
import { pushRouteUpdate } from '@/lib/pusher'
import redis from '@/lib/redis'
import { checkBudget, GoogleBudgetError } from '@/lib/google-budget'
import { hydrateRouteItems } from './hydrate'

const ROUTES_API = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const ORS_API    = 'https://api.openrouteservice.org/optimization'

function getGoogleKey() {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY
  if (!key) throw new Error('GOOGLE_MAPS_SERVER_KEY not set')
  return key
}

function getOrsKey() {
  const key = process.env.ORS_API_KEY
  if (!key) throw new Error('ORS_API_KEY not set')
  return key
}

// Wrap a longitude into [-180, 180]. getCenter().lng() (and any value persisted
// before the client-side fix) can be un-normalized (e.g. 246 = -114 + 360) after
// a panTo across the antimeridian. ORS and Google reject out-of-range longitudes,
// so we sanitize EVERY coordinate fed to them here — this is the server-side
// backstop that also repairs already-stored bad data (driver GPS, stops, endpoint).
function normalizeLng(lng) {
  const n = Number(lng)
  if (!Number.isFinite(n)) return n
  return ((n + 180) % 360 + 360) % 360 - 180
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
  const key = getGoogleKey()

  // Google Routes API (New) only supports one origin + one destination per call.
  // For multi-stop routes (driver + N stops + optional endpoint), we use
  // intermediates[] to thread all stops through a single request.
  const [origin, ...rest] = coords
  const destination = rest[rest.length - 1]
  const intermediates = rest.slice(0, -1)

  const body = {
    origin:      { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    ...(intermediates.length > 0 ? {
      intermediates: intermediates.map((c) => ({
        location: { latLng: { latitude: c.lat, longitude: c.lng } },
      })),
    } : {}),
    travelMode:               'DRIVE',
    computeAlternativeRoutes: false,
  }

  const res = await fetch(ROUTES_API, {
    method:  'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Goog-Api-Key':   key,
      // Request route-level polyline + per-leg distance/duration only.
      // Steps are not needed here — DriverMap fetches its own per-leg directions.
      'X-Goog-FieldMask': 'routes.polyline,routes.legs.distanceMeters,routes.legs.duration',
    },
    body:  JSON.stringify(body),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let detail = text
    try { detail = JSON.parse(text)?.error?.message ?? text } catch { /* keep raw */ }
    console.error('[reoptimize] Google Routes API error', res.status, detail)
    throw new Error(`Google Routes API error ${res.status}`)
  }
  const data = await res.json()
  if (!data.routes?.length) throw new Error('No route found')

  const route = data.routes[0]
  // Google Routes v2 returns the full route polyline at the route level (Polyline5).
  // Per-leg duration is a string like "123s".
  const legs = route.legs ?? []
  const legDurations = legs.map((leg) => Math.round(parseInt(leg.duration ?? '0s', 10) || 0))
  const distance = legs.reduce((sum, l) => sum + (l.distanceMeters ?? 0), 0)
  const duration = legs.reduce((sum, l) => sum + (parseInt(l.duration ?? '0s', 10) || 0), 0)

  return {
    encodedPolyline: route.polyline?.encodedPolyline ?? '',
    distanceMeters:  Math.round(distance),
    durationSeconds: Math.round(duration),
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

  // Sanitize the incoming driver GPS up front — every downstream consumer
  // (ORS start, Google origin, Haversine) depends on it being in range.
  currentLng = normalizeLng(currentLng)

  // Normalize every stored stop coordinate. Routes created before the
  // client-side antimeridian fix can carry a wrapped longitude (e.g. 246),
  // which ORS/Google reject — repair them here so old routes still optimise.
  const allStops = (route.optimizedStops ?? []).map((s) =>
    s?.coordinates
      ? { ...s, coordinates: { lat: s.coordinates.lat, lng: normalizeLng(s.coordinates.lng) } }
      : s,
  )
  const completedStops    = allStops.filter((s) => s.completedAt)
  const pendingStops      = allStops.filter((s) => !s.completedAt && s.stopType !== 'endpoint')
  const existingEndpoint  = allStops.find((s) => s.stopType === 'endpoint' && !s.completedAt)

  if (pendingStops.length < 1) return null

  const rawEndPoint = endPointOverride
    ?? (existingEndpoint
      ? { lng: existingEndpoint.coordinates.lng, lat: existingEndpoint.coordinates.lat, address: existingEndpoint.address }
      : route.endPoint ?? null)
  // Normalize the endpoint longitude too (override may come from a client path,
  // and route.endPoint may be old persisted data).
  const endPoint = rawEndPoint
    ? { ...rawEndPoint, lng: normalizeLng(rawEndPoint.lng) }
    : null

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
    if (err instanceof GoogleBudgetError) {
      console.warn(`[reoptimize] directions budget tripped (${err.scope}) — keeping existing polyline`)
    } else {
      // Real API failure (denied key, API not enabled, billing). Without this
      // log the route silently keeps a null/stale polyline and falls back to
      // Haversine ETAs — looks "fine" but isn't. getDirectionsPolyline already
      // logged the Google detail; this records that we degraded.
      console.warn('[reoptimize] directions failed — keeping existing polyline, Haversine ETA fallback:', err.message)
    }
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
