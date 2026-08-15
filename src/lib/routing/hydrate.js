import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db/client'

/**
 * Attach booking fields the driver UI needs onto each stop, so it never has
 * to make a second round-trip per stop:
 *   packageKind    — packageDetails.kind, the package type label
 *   trackingToken  — the customer-facing tracking ID. Load-bearing when
 *                    several bookings share one pickup address: it is the
 *                    only thing that tells two otherwise-identical stops
 *                    apart, so a driver told "cancel the one for ABC123"
 *                    can pick the right stop to fail.
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
      { projection: { 'packageDetails.kind': 1, trackingToken: 1 } },
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
        packageKind:   b.packageDetails?.kind ?? null,
        trackingToken: b.trackingToken ?? null,
      }
    }),
  }
}
