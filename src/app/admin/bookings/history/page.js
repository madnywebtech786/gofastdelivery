import { requireAdmin } from '@/lib/dal'
import { findAllBookings, countAllBookings, attachCustomerAccounts } from '@/lib/db/bookings'
import { calgaryStartOfDay, calgaryEndOfDay } from '@/lib/dateFormat'
import AdminHistoryClient from './AdminHistoryClient'

export const metadata = { title: 'Booking History — Courier Admin' }

const HISTORY_STATUSES = ['delivered', 'cancelled']
const VALID_FILTERS    = ['', 'delivered', 'cancelled']
const PAGE_SIZE        = 20

export default async function AdminBookingHistoryPage({ searchParams }) {
  await requireAdmin()
  const sp = await searchParams

  const rawStatus = typeof sp?.status === 'string' ? sp.status : ''
  const statusFilter = VALID_FILTERS.includes(rawStatus) ? rawStatus : ''

  const rawPage = parseInt(sp?.page, 10)
  const page    = rawPage >= 1 ? rawPage : 1
  const skip    = (page - 1) * PAGE_SIZE

  const rawFrom  = typeof sp?.from   === 'string' ? sp.from   : ''
  const rawTo    = typeof sp?.to     === 'string' ? sp.to     : ''
  const rawSearch = typeof sp?.search === 'string' ? sp.search.trim() : ''
  const rawDriverId = typeof sp?.driverId === 'string' && /^[0-9a-fA-F]{24}$/.test(sp.driverId) ? sp.driverId : ''

  const rawPriceMin = typeof sp?.priceMin === 'string' ? Number(sp.priceMin) : NaN
  const rawPriceMax = typeof sp?.priceMax === 'string' ? Number(sp.priceMax) : NaN
  const priceMin = Number.isFinite(rawPriceMin) && rawPriceMin >= 0 ? rawPriceMin : null
  const priceMax = Number.isFinite(rawPriceMax) && rawPriceMax >= 0 ? rawPriceMax : null

  // The admin picks these dates looking at a Calgary calendar, so the range
  // has to span the Calgary day — not the server's (UTC on Vercel), which
  // would shift both ends by 6-7 hours and pull in / drop a day's bookings.
  const sinceDate = rawFrom ? calgaryStartOfDay(rawFrom) : null
  const untilDate = rawTo   ? calgaryEndOfDay(rawTo)     : null

  const statusArg = statusFilter ? [statusFilter] : HISTORY_STATUSES

  // This page ONLY ever lists delivered/cancelled bookings, so "on this date"
  // can only sensibly mean the date it was delivered/cancelled (updatedAt) —
  // not createdAt (the default elsewhere), which is when the booking was
  // originally PLACED. Filtering on createdAt silently dropped any booking
  // that took more than a few hours from booking to completion: e.g. a
  // booking placed Aug 13 and delivered Aug 14 has updatedAt on the 14th, so
  // it belongs in an "Aug 14" filtered view even though createdAt says the 13th.
  const [rawBookings, total] = await Promise.all([
    findAllBookings({ status: statusArg, driverId: rawDriverId || undefined, priceMin, priceMax, sinceDate, untilDate, dateField: 'updatedAt', search: rawSearch || undefined, excludeHiddenFromHistory: true, limit: PAGE_SIZE, skip }),
    countAllBookings({ status: statusArg, driverId: rawDriverId || undefined, priceMin, priceMax, sinceDate, untilDate, dateField: 'updatedAt', search: rawSearch || undefined, excludeHiddenFromHistory: true }),
  ])
  const bookings = await attachCustomerAccounts(rawBookings)

  return (
    <AdminHistoryClient
      initialStatusFilter={statusFilter}
      initialDateFrom={rawFrom}
      initialDateTo={rawTo}
      initialSearch={rawSearch}
      initialDriverId={rawDriverId}
      initialPriceMin={priceMin != null ? String(priceMin) : ''}
      initialPriceMax={priceMax != null ? String(priceMax) : ''}
      initialPage={page}
      bookings={JSON.parse(JSON.stringify(bookings))}
      total={total}
      pageSize={PAGE_SIZE}
    />
  )
}
