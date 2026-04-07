/**
 * optimizer.js — Simple nearest-neighbour stop re-ordering.
 *
 * For MVP (2 drivers, ~20 pickups) a greedy nearest-neighbour heuristic
 * is fast, free, and good enough. No external API call needed.
 *
 * Re-ordering only applies to remaining (incomplete) stops.
 * Pickup stops always come before their corresponding dropoff.
 */

/**
 * Haversine distance in metres between two points.
 */
function dist(a, b) {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

/**
 * Re-order remaining stops using nearest-neighbour TSP starting from
 * the driver's current position.
 *
 * Constraint: for each bookingId, pickup must precede dropoff.
 *
 * @param {{ lat: number, lng: number }} driverPosition — current driver location
 * @param {Array} stops — remaining optimizedStops from routes collection
 * @returns {Array} — re-ordered stops array
 */
export function reorderStops(driverPosition, stops) {
  if (!stops || stops.length <= 1) return stops ?? []

  const remaining = [...stops]
  const ordered = []
  let current = driverPosition

  // Track which bookingIds have had their pickup visited
  const visitedPickups = new Set()

  while (remaining.length > 0) {
    let bestIdx = -1
    let bestDist = Infinity

    for (let i = 0; i < remaining.length; i++) {
      const stop = remaining[i]

      // Enforce pickup-before-dropoff constraint:
      // Skip dropoff stops whose pickup hasn't been visited yet
      if (
        stop.stopType === 'dropoff' &&
        stop.bookingId &&
        !visitedPickups.has(stop.bookingId.toString())
      ) {
        continue
      }

      const d = dist(current, stop.coordinates)
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }

    // If no valid next stop found (all remaining are blocked dropoffs),
    // force the first remaining pickup to unblock the chain
    if (bestIdx === -1) {
      bestIdx = remaining.findIndex((s) => s.stopType === 'pickup')
      if (bestIdx === -1) bestIdx = 0 // fallback
    }

    const chosen = remaining.splice(bestIdx, 1)[0]
    if (chosen.stopType === 'pickup' && chosen.bookingId) {
      visitedPickups.add(chosen.bookingId.toString())
    }

    ordered.push(chosen)
    current = chosen.coordinates
  }

  return ordered
}
