import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { hideBookingsFromHistory } from '@/lib/db/bookings'

const MAX_BATCH_SIZE = 500

/**
 * POST /api/bookings/history/delete
 * Body: { bookingIds: string[] }
 *
 * Soft-deletes (hides from the admin History page) the given bookings — sets
 * hiddenFromHistory: true, scoped server-side to delivered/cancelled bookings
 * only (see hideBookingsFromHistory doc comment). Does not remove the
 * documents — dashboard/driver stats keep reading them.
 */
export async function POST(request) {
  try {
    await requireAdmin()
    const { bookingIds } = await request.json()

    if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
      return NextResponse.json({ error: 'bookingIds is required' }, { status: 400 })
    }
    if (bookingIds.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `Cannot delete more than ${MAX_BATCH_SIZE} at once` }, { status: 400 })
    }
    if (!bookingIds.every((id) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id))) {
      return NextResponse.json({ error: 'Invalid bookingId in list' }, { status: 400 })
    }

    const result = await hideBookingsFromHistory(bookingIds)
    revalidatePath('/admin/bookings/history')

    return NextResponse.json({ success: true, deletedCount: result.modifiedCount })
  } catch (err) {
    return handleApiError(err, '[POST /api/bookings/history/delete]')
  }
}
