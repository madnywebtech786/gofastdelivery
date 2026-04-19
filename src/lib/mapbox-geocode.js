/**
 * Shared Mapbox Geocoding utilities — client-side callers.
 *
 * Now routed through /api/mapbox/geocode which:
 *   - keeps MAPBOX_SECRET_TOKEN out of the browser,
 *   - caches results in Redis (reverse: 7d, forward: 1d),
 *   - gates calls via the per-minute/day/month mapbox-budget.
 *
 * Signatures preserved so BookingMap and driver end-point modal are drop-in.
 * The `token` param is ignored (kept for backward-compat).
 */

/**
 * Reverse geocode: convert coordinates to address.
 * Returns { address, city }.
 *
 * Callers MAY pass an AbortSignal as the third arg to cancel an in-flight
 * lookup (e.g. when the user keeps panning).
 */
export function reverseGeocode(lng, lat, _token, signal) {
  const url = `/api/mapbox/geocode?type=reverse&lng=${encodeURIComponent(lng)}&lat=${encodeURIComponent(lat)}`
  return fetch(url, { signal, cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => ({
      address: d.address ?? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`,
      city:    d.city    ?? '',
    }))
    .catch((err) => {
      if (err?.name === 'AbortError') throw err
      return { address: `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`, city: '' }
    })
}

/**
 * Forward geocode: search for addresses by query. Returns an array of Mapbox
 * features (max 5). Queries shorter than 3 chars short-circuit to [] on
 * the server to protect budget.
 */
export function forwardGeocode(query, _token, signal) {
  const q = String(query ?? '').trim()
  if (q.length < 3) return Promise.resolve([])
  const url = `/api/mapbox/geocode?type=forward&q=${encodeURIComponent(q)}`
  return fetch(url, { signal, cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => d.features ?? [])
    .catch((err) => {
      if (err?.name === 'AbortError') throw err
      return []
    })
}
