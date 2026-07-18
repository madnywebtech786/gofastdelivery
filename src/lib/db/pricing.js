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

const SETTINGS_ID = 'global'
const DEFAULT_SETTINGS = { maxWeightLbs: 20, overweightSurcharge: 0 }

/**
 * Get the single global pricing-settings doc, seeded with defaults if absent.
 */
export async function getPricingSettings() {
  const db = await getDb()
  const doc = await db.collection('pricing_settings').findOne({ _id: SETTINGS_ID })
  if (!doc) return { _id: SETTINGS_ID, ...DEFAULT_SETTINGS }
  return doc
}

export async function updatePricingSettings({ maxWeightLbs, overweightSurcharge }) {
  const db = await getDb()
  return db.collection('pricing_settings').updateOne(
    { _id: SETTINGS_ID },
    {
      $set: {
        maxWeightLbs: Number(maxWeightLbs),
        overweightSurcharge: Number(overweightSurcharge),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  )
}
