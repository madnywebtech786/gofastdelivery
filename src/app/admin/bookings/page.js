import { requireAdmin } from '@/lib/dal'
import { findAllBookings, countAllBookings } from '@/lib/db/bookings'
import AdminBookingsClient from './AdminBookingsClient'

export const metadata = { title: 'Bookings — Courier Admin' }

// Maps URL filter keys to DB query params
const FILTER_QUERY_MAP = {
  pending:        { status: ['pending'] },
  on_the_way:     { status: ['assigned_pickup', 'assigned_delivery', 'picked_up'], hasDriver: true },
  picked_up:      { status: ['picked_up'], hasDriver: false },
  failed_pickup:  { status: ['failed_pickup'] },
  failed_dropoff: { status: ['failed_dropoff'] },
}

const VALID_FILTERS = Object.keys(FILTER_QUERY_MAP)

const PAGE_SIZE = 20

export default async function AdminBookingsPage({ searchParams }) {
  await requireAdmin()
  const sp = await searchParams

  const rawStatus = typeof sp?.status === 'string' ? sp.status : ''
  const statusFilter = VALID_FILTERS.includes(rawStatus) ? rawStatus : VALID_FILTERS[0]

  const rawPage = parseInt(sp?.page, 10)
  const page = rawPage >= 1 ? rawPage : 1
  const skip = (page - 1) * PAGE_SIZE

  const query = FILTER_QUERY_MAP[statusFilter]

  const [bookings, total] = await Promise.all([
    findAllBookings({ ...query, limit: PAGE_SIZE, skip }),
    countAllBookings(query),
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
