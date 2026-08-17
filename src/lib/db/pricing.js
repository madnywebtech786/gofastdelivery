import { ObjectId } from 'mongodb'
import { getDb } from './client.js'

const ZONES = ['calgary', 'satellite', 'regional']

function toKey(s) {
  return String(s ?? '').trim().toLowerCase()
}

/**
 * List all cities, sorted by zone then name.
 */
export async function getAllCities() {
  const db = await getDb()
  return db.collection('cities').find({}).sort({ zone: 1, name: 1 }).toArray()
}

/**
 * Create or update a city by its case-insensitive key.
 * Throws if `zone` isn't one of ZONES.
 */
export async function upsertCity({ name, zone }) {
  if (!ZONES.includes(zone)) {
    throw new Error(`Invalid zone "${zone}" — must be one of ${ZONES.join(', ')}`)
  }
  const nameKey = toKey(name)
  if (!nameKey) throw new Error('City name is required')
  const db = await getDb()
  return db.collection('cities').updateOne(
    { nameKey },
    {
      $set: { nameKey, name: String(name).trim(), zone, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  )
}

export async function deleteCity(id) {
  const db = await getDb()
  return db.collection('cities').deleteOne({ _id: new ObjectId(id) })
}

/**
 * Canonical unordered-pair key: sorts the two city keys alphabetically so
 * Calgary→Airdrie and Airdrie→Calgary always resolve to the same pair.
 */
function pairKey(cityKeyA, cityKeyB) {
  return [cityKeyA, cityKeyB].sort()
}

/**
 * List all pricing rules, sorted by cityA then cityB.
 */
export async function getAllPricingRules() {
  const db = await getDb()
  return db.collection('pricing_rules').find({}).sort({ cityAKey: 1, cityBKey: 1 }).toArray()
}

/**
 * Create or update the rule for a city pair. Order of arguments doesn't
 * matter — Airdrie/Calgary and Calgary/Airdrie hit the same stored row.
 * Both cities must already exist in the city registry.
 */
export async function upsertPricingRule({ cityA, cityB, baseRate, additionalPackageRate }) {
  const keyA = toKey(cityA)
  const keyB = toKey(cityB)
  if (!keyA || !keyB) throw new Error('Both cities are required')

  const db = await getDb()
  const cities = await db.collection('cities').find({ nameKey: { $in: [keyA, keyB] } }).toArray()
  const cityByKey = new Map(cities.map((c) => [c.nameKey, c]))
  if (!cityByKey.has(keyA) || !cityByKey.has(keyB)) {
    throw new Error('Both cities must already exist in the city registry')
  }

  const [sortedA, sortedB] = pairKey(keyA, keyB)
  const displayA = cityByKey.get(sortedA).name
  const displayB = cityByKey.get(sortedB).name

  return db.collection('pricing_rules').updateOne(
    { cityAKey: sortedA, cityBKey: sortedB },
    {
      $set: {
        cityAKey: sortedA, cityBKey: sortedB,
        cityADisplay: displayA, cityBDisplay: displayB,
        baseRate: Number(baseRate),
        additionalPackageRate: Number(additionalPackageRate),
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  )
}

export async function deletePricingRule(id) {
  const db = await getDb()
  return db.collection('pricing_rules').deleteOne({ _id: new ObjectId(id) })
}

/**
 * List all weight bands, lightest-first. Each band prices ONE package by its
 * own weight — see calculatePrice() in src/lib/pricing.js for the lookup
 * (falls back to the lowest band under the smallest min, highest band over
 * the largest max, so every weight always has a price).
 */
export async function getAllWeightBands() {
  const db = await getDb()
  return db.collection('weight_bands').find({}).sort({ minLbs: 1 }).toArray()
}

/**
 * Create or update a weight band. `id` present = edit that row (min/max/rate
 * all replaced); absent = insert a new row. Overlap with existing bands is
 * intentionally NOT rejected here — see the route handler for why.
 */
export async function upsertWeightBand({ id, minLbs, maxLbs, rate }) {
  const min = Number(minLbs)
  const max = Number(maxLbs)
  const r   = Number(rate)
  if (!Number.isFinite(min) || min < 0) throw new Error('Min weight must be zero or a positive number')
  if (!Number.isFinite(max) || max <= min) throw new Error('Max weight must be greater than min weight')
  if (!Number.isFinite(r) || r < 0) throw new Error('Rate must be zero or a positive number')

  const db = await getDb()
  const doc = { minLbs: min, maxLbs: max, rate: r, updatedAt: new Date() }

  if (id) {
    return db.collection('weight_bands').updateOne({ _id: new ObjectId(id) }, { $set: doc })
  }
  return db.collection('weight_bands').insertOne({ ...doc, createdAt: new Date() })
}

export async function deleteWeightBand(id) {
  const db = await getDb()
  return db.collection('weight_bands').deleteOne({ _id: new ObjectId(id) })
}
