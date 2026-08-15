import { notFound } from 'next/navigation'
import { requireCustomer } from '@/lib/dal'
import { findBookingById, attachCustomerAccounts } from '@/lib/db/bookings'
import BookingDetailClient from './BookingDetailClient'

export const metadata = { title: 'Booking Detail — Go Fast Delivery Inc.' }

export default async function CustomerBookingDetailPage({ params }) {
  const { bookingId } = await params
  const { userId } = await requireCustomer()

  const booking = await findBookingById(bookingId, { customerId: userId })
  if (!booking) notFound()

  const [withAccount] = await attachCustomerAccounts([booking])
  const origin = process.env.APP_BASE_URL ?? 'http://localhost:3000'

  return (
    <BookingDetailClient
      booking={JSON.parse(JSON.stringify(withAccount))}
      origin={origin}
    />
  )
}
