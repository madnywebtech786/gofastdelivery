import { NextResponse } from 'next/server'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { getPricingSettings, updatePricingSettings } from '@/lib/db/pricing'

export async function GET() {
  try {
    await requireAdmin()
    const settings = await getPricingSettings()
    return NextResponse.json(JSON.parse(JSON.stringify(settings)))
  } catch (err) {
    return handleApiError(err, '[GET /api/pricing/settings]')
  }
}

export async function PATCH(request) {
  try {
    await requireAdmin()
    const { maxWeightLbs, overweightSurcharge } = await request.json()
    if (maxWeightLbs == null || overweightSurcharge == null) {
      return NextResponse.json({ error: 'maxWeightLbs and overweightSurcharge are required' }, { status: 400 })
    }
    if (Number(maxWeightLbs) <= 0 || Number(overweightSurcharge) < 0) {
      return NextResponse.json({ error: 'Invalid values' }, { status: 400 })
    }
    await updatePricingSettings({ maxWeightLbs, overweightSurcharge })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, '[PATCH /api/pricing/settings]')
  }
}
