import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { hideAllHistoryFromView } from '@/lib/db/bookings'

/**
 * POST /api/bookings/history/clear
 *
 * "Clear History" — soft-deletes EVERY delivered/cancelled booking, ignoring
 * any status/date/search filter currently applied in the admin UI (confirmed
 * intended behavior: a full reset, not scoped to the current view). Does not
 * remove the documents — see hideAllHistoryFromView doc comment.
 */
export async function POST() {
  try {
    await requireAdmin()

    const result = await hideAllHistoryFromView()
    revalidatePath('/admin/bookings/history')

    return NextResponse.json({ success: true, clearedCount: result.modifiedCount })
  } catch (err) {
    return handleApiError(err, '[POST /api/bookings/history/clear]')
  }
}
