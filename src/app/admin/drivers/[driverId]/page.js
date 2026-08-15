import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/dal'
import { findDriverById, findActiveRoute, getDriverStats } from '@/lib/db/drivers'
import { findBookingsByDriver } from '@/lib/db/bookings'
import { calgaryYearMonth } from '@/lib/dateFormat'
import { Suspense } from 'react'
import DriverDetailClient from './DriverDetailClient'

export const metadata = { title: 'Driver Detail — Go Fast Delivery Inc.' }

export default async function AdminDriverDetailPage({ params, searchParams }) {
  const { driverId } = await params
  const sp = await searchParams

  await requireAdmin()

  const nowInCalgary = calgaryYearMonth()
  const year  = parseInt(sp?.year  ?? '') || nowInCalgary.year
  const month = parseInt(sp?.month ?? '') || nowInCalgary.month
  const DISTANCE_RANGES = new Set(['day', 'week', 'month', 'year'])
  const distanceRange = DISTANCE_RANGES.has(sp?.distanceRange) ? sp.distanceRange : 'month'

  const [driver, route, stats, bookings] = await Promise.all([
    findDriverById(driverId),
    findActiveRoute(driverId),
    getDriverStats(driverId, { year, month, distanceRange }),
    findBookingsByDriver(driverId, { limit: 10000 }),
  ])

  if (!driver) notFound()

  const d = JSON.parse(JSON.stringify(driver))
  const r = route ? JSON.parse(JSON.stringify(route)) : null
  const s = JSON.parse(JSON.stringify(stats))
  const b = JSON.parse(JSON.stringify(bookings))

  return (
    <Suspense>
      <DriverDetailClient
        driver={d}
        route={r}
        stats={s}
        bookings={b}
        driverId={driverId}
      />
    </Suspense>
  )
}
