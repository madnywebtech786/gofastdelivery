'use client'

import { useEffect } from 'react'
import { usePusher } from './PusherProvider'

/**
 * BookingStatusListener — subscribes to private-booking-{bookingId} channel.
 * Calls onStatusChange(data) on updates — two independent payload shapes
 * share this one event (see pushBookingStatusChange in src/lib/pusher.js):
 *   - Real status transitions: { status, updatedAt }
 *   - ETA-only pushes (a reroute recomputed this booking's ETA, status
 *     unchanged): { pickupEta, dropoffEta }, no `status` key present.
 * Consumers must check `data.status != null` before treating an update as a
 * real transition (e.g. before appending a statusHistory entry).
 * Used by both customer and receiver pages.
 */
export default function BookingStatusListener({ bookingId, onStatusChange }) {
  const pusher = usePusher()

  useEffect(() => {
    if (!pusher || !bookingId) return

    const channel = pusher.subscribe(`private-booking-${bookingId}`)

    channel.bind('booking:status_changed', (data) => {
      onStatusChange?.(data)
    })

    channel.bind('pusher:subscription_error', (err) => {
      console.error('[BookingStatusListener] Channel subscription error:', err)
    })

    return () => {
      channel.unbind_all()
      pusher.unsubscribe(`private-booking-${bookingId}`)
    }
  }, [pusher, bookingId, onStatusChange])

  return null
}
