/**
 * Pure pricing calculator — no DB access. Callers (client preview, server
 * recompute) fetch cities/rules/settings themselves and pass them in as
 * plain data, so there is exactly one pricing algorithm, not two kept in
 * sync by hand.
 */

const HUB_FEE = 5

function toKey(s) {
  return String(s ?? '').trim().toLowerCase()
}

/**
 * Look up a city's zone doc by name (case-insensitive). Returns null if the
 * city hasn't been registered by the admin yet.
 */
function findCity(cities, name) {
  const key = toKey(name)
  return cities.find((c) => c.nameKey === key) ?? null
}

/**
 * Look up the stored rule for a city pair, regardless of argument order
 * (mirrors the sorted-pair storage in src/lib/db/pricing.js).
 */
function findRule(rules, cityKeyA, cityKeyB) {
  const [a, b] = [cityKeyA, cityKeyB].sort()
  return rules.find((r) => r.cityAKey === a && r.cityBKey === b) ?? null
}

/**
 * calculatePrice({ fromCityName, toCityName, packages, cities, rules, settings })
 *
 * packages: [{ weightLbs: number }, ...] — at least one.
 * cities/rules/settings: already-fetched plain arrays/object (see
 *   getAllCities/getAllPricingRules/getPricingSettings in src/lib/db/pricing.js).
 *
 * Returns:
 *   { total, breakdown: { routeLabel, hubFee, baseRate, additionalPackagesTotal,
 *     overweightTotal, packageCount, overweightCount } }
 * or null if either city is unrecognized or no rule exists for the route.
 */
export function calculatePrice({ fromCityName, toCityName, packages, cities, rules, settings }) {
  if (!packages || packages.length === 0) return null
  if (!cities || !rules) return null

  const fromCity = findCity(cities, fromCityName)
  const toCity = findCity(cities, toCityName)
  if (!fromCity || !toCity) return null

  let rule = null
  let hubFee = 0
  let routeLabel

  const bothSatellite = fromCity.zone === 'satellite' && toCity.zone === 'satellite'
  const differentCities = fromCity.nameKey !== toCity.nameKey

  if (bothSatellite && differentCities) {
    // Trans-city via Calgary hub: $5 hub fee + destination city's Calgary rate.
    const hubCity = cities.find((c) => c.zone === 'calgary')
    if (!hubCity) return null
    rule = findRule(rules, hubCity.nameKey, toCity.nameKey)
    if (!rule) return null
    hubFee = HUB_FEE
    routeLabel = `${fromCity.name} → Calgary Hub → ${toCity.name}`
  } else {
    rule = findRule(rules, fromCity.nameKey, toCity.nameKey)
    if (!rule) return null
    routeLabel = fromCity.nameKey === toCity.nameKey
      ? `Within ${fromCity.name}`
      : `${fromCity.name} → ${toCity.name}`
  }

  const maxWeightLbs = settings?.maxWeightLbs ?? 20
  const overweightSurcharge = settings?.overweightSurcharge ?? 0

  let additionalPackagesTotal = 0
  let overweightTotal = 0
  let overweightCount = 0

  packages.forEach((pkg, i) => {
    if (i > 0) additionalPackagesTotal += rule.additionalPackageRate
    if (Number(pkg.weightLbs) > maxWeightLbs) {
      overweightTotal += overweightSurcharge
      overweightCount += 1
    }
  })

  const total = hubFee + rule.baseRate + additionalPackagesTotal + overweightTotal

  return {
    total,
    breakdown: {
      routeLabel,
      hubFee,
      baseRate: rule.baseRate,
      additionalPackagesTotal,
      overweightTotal,
      packageCount: packages.length,
      overweightCount,
    },
  }
}
