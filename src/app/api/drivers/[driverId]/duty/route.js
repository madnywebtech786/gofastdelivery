import { NextResponse } from 'next/server'
import { requireDriver, handleApiError } from '@/lib/dal'
import { setDriverOnDuty } from '@/lib/db/users'

/**
 * PATCH /api/drivers/[driverId]/duty
 * Body: { isOnDuty: boolean }
 *
 * Lets a driver set their own online/offline (on-duty) status. Persisted in
 * Mongo, not session/localStorage, so it survives logout — stays whatever the
 * driver last set it to until they change it again.
 */
export async function PATCH(request, { params }) {
  try {
    const { driverId } = await params
    const { userId } = await requireDriver()

    // Drivers can only set their own duty status
    if (driverId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { isOnDuty } = await request.json()
    if (typeof isOnDuty !== 'boolean') {
      return NextResponse.json({ error: 'isOnDuty must be a boolean' }, { status: 400 })
    }

    await setDriverOnDuty(driverId, isOnDuty)

    return NextResponse.json({ success: true, isOnDuty })
  } catch (err) {
    return handleApiError(err, '[PATCH /api/drivers/[driverId]/duty]')
  }
}
