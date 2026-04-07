/**
 * deviation.js — Determines if a location trace deviates significantly
 * from the expected route corridor.
 *
 * Cost-critical: this check runs BEFORE any Mapbox API call.
 * Only if deviation > threshold do we invoke Map Matching (billable).
 */

const DEVIATION_THRESHOLD_M = 50 // metres

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
 * Point-to-segment distance in metres.
 * Projects point P onto segment AB; returns distance from P to the closest
 * point on the segment.
 */
function pointToSegmentMeters(pLat, pLng, aLat, aLng, bLat, bLng) {
  const dx = bLng - aLng
  const dy = bLat - aLat
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) return haversineMeters(pLat, pLng, aLat, aLng)

  const t = Math.max(0, Math.min(1, ((pLng - aLng) * dx + (pLat - aLat) * dy) / lenSq))
  return haversineMeters(pLat, pLng, aLat + t * dy, aLng + t * dx)
}

/**
 * Decode a Mapbox polyline6 encoded string into [{lat, lng}] array.
 * Uses precision=6 (Mapbox default for polyline6).
 */
function decodePolyline6(encoded) {
  const coords = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let b
    let shift = 0
    let result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    shift = 0
    result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1

    coords.push({ lat: lat / 1e6, lng: lng / 1e6 })
  }
  return coords
}

/**
 * Check if any point in the trace is more than DEVIATION_THRESHOLD_M
 * from the route polyline corridor.
 *
 * @param {Array<{lat, lng, ts}>} tracePoints
 * @param {string} encodedPolyline — Mapbox polyline6 encoded route geometry
 * @param {number} threshold — metres (default 50)
 * @returns {{ deviated: boolean, maxDeviationM: number }}
 */
export function checkDeviation(tracePoints, encodedPolyline, threshold = DEVIATION_THRESHOLD_M) {
  if (!tracePoints?.length || !encodedPolyline) {
    return { deviated: false, maxDeviationM: 0 }
  }

  const routeCoords = decodePolyline6(encodedPolyline)
  if (routeCoords.length < 2) {
    return { deviated: false, maxDeviationM: 0 }
  }

  let maxDeviationM = 0

  for (const point of tracePoints) {
    // Find minimum distance from this trace point to any route segment
    let minDist = Infinity
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const dist = pointToSegmentMeters(
        point.lat, point.lng,
        routeCoords[i].lat, routeCoords[i].lng,
        routeCoords[i + 1].lat, routeCoords[i + 1].lng
      )
      if (dist < minDist) minDist = dist
    }
    if (minDist > maxDeviationM) maxDeviationM = minDist
  }

  return { deviated: maxDeviationM > threshold, maxDeviationM }
}
