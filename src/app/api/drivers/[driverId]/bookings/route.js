import { NextResponse } from 'next/server'
import { requireDriver, handleApiError } from '@/lib/dal'
import { findBookingsByDriver, countBookingsByDriver } from '@/lib/db/bookings'

const VALID_RANGES = new Set(['day', 'week', 'month', 'year'])
const PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

/**
 * GET /api/drivers/[driverId]/bookings?statusGroup=&range=&page=&pageSize=
 *
 * range omitted/invalid = all-time (no date filter) — the driver history
 * page defaults here so a driver can see every past delivery, not just
 * today/yesterday, with day/week/month/year as opt-in filters.
 */
export async function GET(request, { params }) {
  try {
    const { driverId } = await params
    const { userId } = await requireDriver()

    if (driverId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const statusGroup = searchParams.get('statusGroup') ?? 'all'
    const rawRange = searchParams.get('range')
    const range = VALID_RANGES.has(rawRange) ? rawRange : undefined

    const rawPage = parseInt(searchParams.get('page'), 10)
    const page = rawPage >= 1 ? rawPage : 1
    const rawPageSize = parseInt(searchParams.get('pageSize'), 10)
    const pageSize = rawPageSize >= 1 ? Math.min(rawPageSize, MAX_PAGE_SIZE) : PAGE_SIZE
    const skip = (page - 1) * pageSize

    const [bookings, total] = await Promise.all([
      findBookingsByDriver(driverId, { statusGroup, range, limit: pageSize, skip }),
      countBookingsByDriver(driverId, { statusGroup, range }),
    ])

    return NextResponse.json({
      bookings: JSON.parse(JSON.stringify(bookings)),
      total,
      page,
      pageSize,
    })
  } catch (err) {
    return handleApiError(err, '[GET /api/drivers/[driverId]/bookings]')
  }
}
