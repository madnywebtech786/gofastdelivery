import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/dal'
import { findDriverById, findActiveRoute, getDriverStats } from '@/lib/db/drivers'
import { findBookingsByDriver } from '@/lib/db/bookings'
import { Suspense } from 'react'
import DriverDetailClient from './DriverDetailClient'

export const metadata = { title: 'Driver Detail — Go Fast Delivery' }

export default async function AdminDriverDetailPage({ params, searchParams }) {
  const { driverId } = await params
  const sp = await searchParams

  await requireAdmin()

  const now  = new Date()
  const year  = parseInt(sp?.year  ?? '') || now.getFullYear()
  const month = parseInt(sp?.month ?? '') || now.getMonth() + 1

  const [driver, route, stats, bookings] = await Promise.all([
    findDriverById(driverId),
    findActiveRoute(driverId),
    getDriverStats(driverId, { year, month }),
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
