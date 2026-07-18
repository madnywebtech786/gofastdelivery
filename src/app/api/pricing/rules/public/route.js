import { NextResponse } from 'next/server'
import { verifySession, handleApiError } from '@/lib/dal'
import { getAllCities, getAllPricingRules, getPricingSettings } from '@/lib/db/pricing'

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
    const [cities, rules, settings] = await Promise.all([
      getAllCities(),
      getAllPricingRules(),
      getPricingSettings(),
    ])

    const safeCities = cities.map((c) => ({ nameKey: c.nameKey, name: c.name, zone: c.zone }))
    const safeRules = rules.map((r) => ({
      cityAKey: r.cityAKey, cityBKey: r.cityBKey,
      cityADisplay: r.cityADisplay, cityBDisplay: r.cityBDisplay,
      baseRate: r.baseRate, additionalPackageRate: r.additionalPackageRate,
    }))

    return NextResponse.json(
      {
        cities: safeCities,
        rules: safeRules,
        settings: { maxWeightLbs: settings.maxWeightLbs, overweightSurcharge: settings.overweightSurcharge },
      },
      { headers: { 'Cache-Control': 'private, max-age=300' } }
    )
  } catch (err) {
    return handleApiError(err, '[GET /api/pricing/rules/public]')
  }
}
