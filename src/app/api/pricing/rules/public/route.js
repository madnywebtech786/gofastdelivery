import { NextResponse } from 'next/server'
import { verifySession, handleApiError } from '@/lib/dal'
import { getAllCities, getAllPricingRules, getAllWeightBands } from '@/lib/db/pricing'

/**
 * GET /api/pricing/rules/public
 *
 * Everything BookingForm.js needs for a zero-extra-call client-side price
 * preview via calculatePrice() (src/lib/pricing.js) — no admin role required,
 * any authenticated role.
 */
export async function GET() {
  try {
    await verifySession()
    const [cities, rules, weightBands] = await Promise.all([
      getAllCities(),
      getAllPricingRules(),
      getAllWeightBands(),
    ])

    const safeCities = cities.map((c) => ({ nameKey: c.nameKey, name: c.name, zone: c.zone }))
    const safeRules = rules.map((r) => ({
      cityAKey: r.cityAKey, cityBKey: r.cityBKey,
      cityADisplay: r.cityADisplay, cityBDisplay: r.cityBDisplay,
      baseRate: r.baseRate, additionalPackageRate: r.additionalPackageRate,
    }))
    const safeWeightBands = weightBands.map((b) => ({ minLbs: b.minLbs, maxLbs: b.maxLbs, rate: b.rate }))

    return NextResponse.json(
      { cities: safeCities, rules: safeRules, weightBands: safeWeightBands },
      { headers: { 'Cache-Control': 'private, max-age=300' } }
    )
  } catch (err) {
    return handleApiError(err, '[GET /api/pricing/rules/public]')
  }
}
