import { requireCustomer } from '@/lib/dal'
import { findBookingsByCustomer } from '@/lib/db/bookings'
import MyBookingsClient from './MyBookingsClient'

export const metadata = { title: 'My Bookings — Go Fast Delivery' }

export default async function CustomerBookingsPage() {
  const { userId } = await requireCustomer()
  // Fetch up to 100 — client handles filtering/pagination
  const bookings = await findBookingsByCustomer(userId, { limit: 100 })

  return (
    <MyBookingsClient bookings={JSON.parse(JSON.stringify(bookings))} />
  )
}
