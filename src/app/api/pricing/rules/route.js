import { NextResponse } from 'next/server'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { getAllPricingRules, upsertPricingRule, deletePricingRule } from '@/lib/db/pricing'

export async function GET() {
  try {
    await requireAdmin()
    const rules = await getAllPricingRules()
    return NextResponse.json(JSON.parse(JSON.stringify(rules)))
  } catch (err) {
    return handleApiError(err, '[GET /api/pricing/rules]')
  }
}

export async function POST(request) {
  try {
    await requireAdmin()
    const { cityA, cityB, baseRate, additionalPackageRate } = await request.json()
    if (!cityA || !cityB || baseRate == null || additionalPackageRate == null) {
      return NextResponse.json(
        { error: 'cityA, cityB, baseRate, and additionalPackageRate are required' },
        { status: 400 }
      )
    }
    const base = Number(baseRate)
    const additional = Number(additionalPackageRate)
    if (!isFinite(base) || base < 0 || !isFinite(additional) || additional < 0) {
      return NextResponse.json({ error: 'Rates must be zero or a positive number' }, { status: 400 })
    }
    await upsertPricingRule({ cityA, cityB, baseRate: base, additionalPackageRate: additional })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, '[POST /api/pricing/rules]')
  }
}

export async function DELETE(request) {
  try {
    await requireAdmin()
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await deletePricingRule(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, '[DELETE /api/pricing/rules]')
  }
}
