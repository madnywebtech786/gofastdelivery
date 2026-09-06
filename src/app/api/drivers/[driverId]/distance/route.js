import { NextResponse } from 'next/server'
import { requireDriver, handleApiError } from '@/lib/dal'
import { getDriverDistanceForRange, findDriverById } from '@/lib/db/drivers'

/**
 * GET /api/drivers/[driverId]/distance?range=day|week|month|year
 *
 * Driver-facing equivalent of the km-driven chart on the admin driver-detail
 * page — same underlying aggregation (getDriverDistanceForRange), scoped to
 * the calling driver's own id only.
 */
export async function GET(request, { params }) {
  try {
    const { driverId } = await params
    const { userId } = await requireDriver()

    if (driverId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const range = new URL(request.url).searchParams.get('range') ?? 'month'

    const [distanceForRange, driver] = await Promise.all([
      getDriverDistanceForRange(driverId, range),
      findDriverById(driverId),
    ])

    return NextResponse.json({
      totalDistanceDrivenMeters: driver?.driverProfile?.totalDistanceDrivenMeters ?? 0,
      distanceRangeMeters: distanceForRange.distanceMeters,
      distanceRange: distanceForRange.range,
      distanceSeries: distanceForRange.series,
    })
  } catch (err) {
    return handleApiError(err, '[GET /api/drivers/[driverId]/distance]')
  }
}
