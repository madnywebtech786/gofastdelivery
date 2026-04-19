import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db/client'

/**
 * Attach packageDetails.items to each stop that references a booking, so
 * the driver UI can render the per-stop item checklist. Items are kept on
 * the booking (not the route) so they stay authoritative after markItems
 * stamps them — the route is just a projection.
 *
 * Safe to call with already-hydrated input (it re-hydrates from bookings).
 */
export async function hydrateRouteItems(route) {
  const stops = route?.optimizedStops ?? []
  const ids = [...new Set(
    stops.map((s) => (s.bookingId ? String(s.bookingId) : null)).filter(Boolean)
  )]
  if (ids.length === 0) return route

  const db = await getDb()
  const bookings = await db
    .collection('bookings')
    .find(
      { _id: { $in: ids.map((id) => new ObjectId(id)) } },
      { projection: { 'packageDetails.items': 1 } },
    )
    .toArray()
  const byId = new Map(bookings.map((b) => [String(b._id), b]))

  return {
    ...route,
    optimizedStops: stops.map((s) => {
      const b = s.bookingId && byId.get(String(s.bookingId))
      if (!b) return s
      return {
        ...s,
        packageItems: Array.isArray(b.packageDetails?.items) ? b.packageDetails.items : [],
      }
    }),
  }
}
