import Pusher from 'pusher'

if (
  !process.env.PUSHER_APP_ID ||
  !process.env.PUSHER_KEY ||
  !process.env.PUSHER_SECRET ||
  !process.env.PUSHER_CLUSTER
) {
  throw new Error('Pusher environment variables are not set')
}

/**
 * Pusher server-side client.
 * Used for triggering events from Route Handlers and Server Actions.
 */
export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
})

/**
 * Trigger a route:updated event for a specific driver.
 * @param {string} driverId
 * @param {object} routeData
 */
export async function pushRouteUpdate(driverId, routeData) {
  await pusherServer.trigger(`private-driver-${driverId}`, 'route:updated', routeData)
}

/**
 * Trigger a booking update event on the public/private booking channel.
 * Two independent uses share this one event, both consumed by
 * BookingStatusListener (src/components/realtime/BookingStatusListener.js):
 *   - Real status transitions (stop-complete, stop-failed, bulk-assign, etc.)
 *     pass { status, updatedAt }.
 *   - ETA-only pushes (reoptimizeRoute → syncBookingEtas, on an actual
 *     reroute — never per GPS tick) pass { pickupEta, dropoffEta } and
 *     deliberately OMIT `status` so listeners don't mistake a route
 *     recalculation for a real status change.
 * @param {string} bookingId
 * @param {{ status?: string, updatedAt?: string, pickupEta?: string|null, dropoffEta?: string|null }} data
 */
export async function pushBookingStatusChange(bookingId, data) {
  await pusherServer.trigger(`private-booking-${bookingId}`, 'booking:status_changed', data)
}
