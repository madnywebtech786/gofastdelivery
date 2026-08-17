/**
 * Pure pricing calculator — no DB access. Callers (client preview, server
 * recompute) fetch cities/rules/settings themselves and pass them in as
 * plain data, so there is exactly one pricing algorithm, not two kept in
 * sync by hand.
 */

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
 * The weight-band rate for one package's weight. Bands are inclusive on both
 * ends ([minLbs, maxLbs]) and admin-defined (see getAllWeightBands in
 * src/lib/db/pricing.js) — any number of them, sorted lightest-first.
 *
 * A weight below every band's min or above every band's max still needs a
 * price (a pricing-config gap must never silently block checkout), so it
 * clamps to the nearest edge band: lightest band for "too light", heaviest
 * band for "too heavy" — same "always resolve to something" spirit as
 * calculatePrice()'s own null-if-unrecognized-route behaviour elsewhere in
 * this file, just resolved rather than left unpriced since a package weight
 * is the customer's own input, not a route the admin hasn't configured yet.
 *
 * Returns { rate, band } — band is the matched/clamped band doc, or null if
 * no bands exist at all (rate 0 in that case: nothing configured, nothing
 * charged, same as the old surcharge's behaviour when unset).
 */
function findWeightBand(bands, weightLbs) {
  if (!bands || bands.length === 0) return { rate: 0, band: null }
  const w = Number(weightLbs) || 0

  const exact = bands.find((b) => w >= b.minLbs && w <= b.maxLbs)
  if (exact) return { rate: exact.rate, band: exact }

  // bands is sorted lightest-first (getAllWeightBands) — clamp to an edge.
  const lightest = bands[0]
  const heaviest = bands[bands.length - 1]
  if (w < lightest.minLbs) return { rate: lightest.rate, band: lightest }
  return { rate: heaviest.rate, band: heaviest }
}

/**
 * calculatePrice({ fromCityName, toCityName, packages, cities, rules, weightBands })
 *
 * packages: [{ weightLbs: number }, ...] — at least one, each priced
 *   independently against `weightBands` (replaces the old single
 *   maxWeightLbs/overweightSurcharge flat threshold — see findWeightBand).
 * cities/rules/weightBands: already-fetched plain arrays (see
 *   getAllCities/getAllPricingRules/getAllWeightBands in src/lib/db/pricing.js).
 *
 * Returns:
 *   { total, breakdown: { routeLabel, hubFee, baseRate, additionalPackagesTotal,
 *     weightChargeTotal, weightBreakdown, packageCount } }
 *   weightBreakdown: [{ minLbs, maxLbs, rate, count, subtotal }, ...] — one row
 *     per DISTINCT band actually used, grouping packages that landed in the
 *     same band (e.g. "2 packages in the 10-25lb band, $16.00") for the price
 *     summary, sorted lightest-band-first.
 * or null if either city is unrecognized or no rule exists for the route.
 */
export function calculatePrice({ fromCityName, toCityName, packages, cities, rules, weightBands }) {
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
    // Trans-city via Calgary hub: priced at the destination city's Calgary
    // rate (no separate satellite-pair rules needed). No hub handling fee —
    // per client decision, satellite-to-satellite no longer carries the $5
    // surcharge, though the route is still shown as going via the hub.
    const hubCity = cities.find((c) => c.zone === 'calgary')
    if (!hubCity) return null
    rule = findRule(rules, hubCity.nameKey, toCity.nameKey)
    if (!rule) return null
    routeLabel = `${fromCity.name} → Calgary Hub → ${toCity.name}`
  } else {
    rule = findRule(rules, fromCity.nameKey, toCity.nameKey)
    if (!rule) return null
    routeLabel = fromCity.nameKey === toCity.nameKey
      ? `Within ${fromCity.name}`
      : `${fromCity.name} → ${toCity.name}`
  }

  let additionalPackagesTotal = 0
  let weightChargeTotal = 0
  // Grouped by band identity (minLbs-maxLbs), not one row per package — two
  // packages landing in the same band collapse into one summary line with
  // count:2, matching "2 packages in the 10-25lb range" rather than listing
  // the same band twice.
  const bandGroups = new Map()

  packages.forEach((pkg, i) => {
    if (i > 0) additionalPackagesTotal += rule.additionalPackageRate

    // Weight-band pricing only applies once the customer has actually typed a
    // weight for this package. Before that, pkg.weightLbs is '' (the empty
    // form input) — treating that as 0 would match/clamp into the lightest
    // band and silently charge for a weight nobody entered yet. Route pricing
    // (baseRate/additionalPackageRate above) is unaffected either way; only
    // the weight-band lookup itself is skipped.
    if (pkg.weightLbs === '' || pkg.weightLbs == null) return
    const { rate, band } = findWeightBand(weightBands, pkg.weightLbs)
    weightChargeTotal += rate
    if (!band) return // no bands configured at all — nothing to group

    const key = `${band.minLbs}-${band.maxLbs}`
    const existing = bandGroups.get(key)
    if (existing) {
      existing.count += 1
      existing.subtotal += rate
    } else {
      bandGroups.set(key, { minLbs: band.minLbs, maxLbs: band.maxLbs, rate, count: 1, subtotal: rate })
    }
  })

  const weightBreakdown = [...bandGroups.values()].sort((a, b) => a.minLbs - b.minLbs)

  const total = hubFee + rule.baseRate + additionalPackagesTotal + weightChargeTotal

  return {
    total,
    breakdown: {
      routeLabel,
      hubFee,
      baseRate: rule.baseRate,
      additionalPackagesTotal,
      weightChargeTotal,
      weightBreakdown,
      packageCount: packages.length,
    },
  }
}
