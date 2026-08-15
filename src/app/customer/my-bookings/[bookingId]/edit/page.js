import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCustomer } from '@/lib/dal'
import { findBookingById, CUSTOMER_EDITABLE_STATUSES } from '@/lib/db/bookings'
import BookingForm from '@/components/booking/BookingForm'

export const metadata = { title: 'Edit Booking — Go Fast Delivery Inc.' }

export default async function EditBookingPage({ params }) {
  const { bookingId } = await params
  const { userId } = await requireCustomer()

  const booking = await findBookingById(bookingId, { customerId: userId })
  if (!booking) notFound()

  // Editing is only allowed while the booking hasn't been assigned/completed
  // yet — mirrors the server-side gate in PATCH /api/bookings/[bookingId]/edit.
  if (!CUSTOMER_EDITABLE_STATUSES.includes(booking.status)) {
    redirect(`/customer/my-bookings/${bookingId}`)
  }

  return (
    <div className="space-y-6">
      <div className="anim-fade-up">
        <Link
          href={`/customer/my-bookings/${bookingId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium mb-2 transition-opacity hover:opacity-70"
          style={{ color: 'var(--fg-3)' }}
        >
          ← Back to Booking
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Edit Booking</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--fg-3)' }}>
          Update your pickup, drop-off, or package details below.
        </p>
      </div>
      {/* key=bookingId forces a fresh mount per booking — guards against
          stale state if the router ever reuses a BookingForm instance
          between two different bookingIds. */}
      <BookingForm key={bookingId} initialBooking={JSON.parse(JSON.stringify(booking))} />
    </div>
  )
}
