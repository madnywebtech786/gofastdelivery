import { requireAdmin } from '@/lib/dal'
import { findAllBookings } from '@/lib/db/bookings'
import AdminBookingsClient from './AdminBookingsClient'

export const metadata = { title: 'Bookings — Courier Admin' }

export default async function AdminBookingsPage({ searchParams }) {
  await requireAdmin()
  const sp = await searchParams
  const validTabs = ['pickup', 'delivery', 'assigned']
  const tab = validTabs.includes(sp?.tab) ? sp.tab : 'pickup'

  const [pendingBookings, pickedUpBookings, assignedPickup, assignedDelivery] = await Promise.all([
    findAllBookings({ status: 'pending', limit: 100 }),
    findAllBookings({ status: 'picked_up', limit: 100 }),
    findAllBookings({ status: 'assigned_pickup', limit: 100 }),
    findAllBookings({ status: 'assigned_delivery', limit: 100 }),
  ])

  const assignedBookings = [...assignedPickup, ...assignedDelivery]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

  return (
    <AdminBookingsClient
      initialTab={tab}
      pendingBookings={JSON.parse(JSON.stringify(pendingBookings))}
      pickedUpBookings={JSON.parse(JSON.stringify(pickedUpBookings))}
      assignedBookings={JSON.parse(JSON.stringify(assignedBookings))}
    />
  )
}
