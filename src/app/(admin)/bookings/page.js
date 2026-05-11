import { requireAdmin } from '@/lib/dal'
import { findAllBookings, countAllBookings } from '@/lib/db/bookings'
import AdminBookingsClient from './AdminBookingsClient'

export const metadata = { title: 'Bookings — Courier Admin' }

const VALID_STATUSES = [
  'pending',
  'failed_pickup',
  'assigned_pickup',
  'picked_up',
  'failed_dropoff',
  'assigned_delivery',
  'delivered',
  'cancelled',
]

const PAGE_SIZE = 20

export default async function AdminBookingsPage({ searchParams }) {
  await requireAdmin()
  const sp = await searchParams

  const rawStatus = typeof sp?.status === 'string' ? sp.status : ''
  const statusFilter = VALID_STATUSES.includes(rawStatus) ? rawStatus : ''

  const rawPage = parseInt(sp?.page, 10)
  const page = rawPage >= 1 ? rawPage : 1
  const skip = (page - 1) * PAGE_SIZE

  const statusArg = statusFilter ? [statusFilter] : undefined

  const [bookings, total] = await Promise.all([
    findAllBookings({ status: statusArg, limit: PAGE_SIZE, skip }),
    countAllBookings({ status: statusArg }),
  ])

  return (
    <AdminBookingsClient
      initialStatusFilter={statusFilter}
      initialPage={page}
      bookings={JSON.parse(JSON.stringify(bookings))}
      total={total}
      pageSize={PAGE_SIZE}
    />
  )
}
