import Link from 'next/link'
import { requireCustomer } from '@/lib/dal'
import BookingForm from '@/components/booking/BookingForm'

export const metadata = { title: 'New Booking — Go Fast Delivery Inc.' }

export default async function BookPage() {
  await requireCustomer()

  return (
    <div className="space-y-6">
      <div className="anim-fade-up">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium mb-2 transition-opacity hover:opacity-70"
          style={{ color: 'var(--fg-3)' }}
        >
          ← Back to Home
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Create New Booking</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--fg-3)' }}>
          Place pins on the map to set your pickup and drop-off points
        </p>
      </div>
      {/* key="create" forces a fresh mount (fresh state, fresh refs) even if
          React would otherwise reuse a BookingForm instance — guards against
          stale values carrying over from a just-visited edit page. */}
      <BookingForm key="create" />
    </div>
  )
}
