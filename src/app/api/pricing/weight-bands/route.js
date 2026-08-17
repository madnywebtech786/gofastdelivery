import { NextResponse } from 'next/server'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { getAllWeightBands, upsertWeightBand, deleteWeightBand } from '@/lib/db/pricing'

export async function GET() {
  try {
    await requireAdmin()
    const bands = await getAllWeightBands()
    return NextResponse.json(JSON.parse(JSON.stringify(bands)))
  } catch (err) {
    return handleApiError(err, '[GET /api/pricing/weight-bands]')
  }
}

// Body: { id? (edit an existing band), minLbs, maxLbs, rate }
export async function POST(request) {
  try {
    await requireAdmin()
    const { id, minLbs, maxLbs, rate } = await request.json()
    if (minLbs == null || maxLbs == null || rate == null) {
      return NextResponse.json({ error: 'minLbs, maxLbs, and rate are required' }, { status: 400 })
    }
    await upsertWeightBand({ id, minLbs, maxLbs, rate })
    return NextResponse.json({ ok: true })
  } catch (err) {
    // upsertWeightBand throws a plain Error with a user-facing message for
    // bad input (negative/inverted range) — surface that instead of a 500.
    if (err instanceof Error && /must be/.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return handleApiError(err, '[POST /api/pricing/weight-bands]')
  }
}

export async function DELETE(request) {
  try {
    await requireAdmin()
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await deleteWeightBand(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, '[DELETE /api/pricing/weight-bands]')
  }
}
