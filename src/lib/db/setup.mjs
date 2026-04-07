/**
 * Database setup: creates all required collections and indexes.
 * Run once on first deploy: node src/lib/db/setup.js
 * Safe to re-run — uses createIndexes which is idempotent.
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

import { getDb } from './client.js'

async function setup() {
  console.log('Setting up MongoDB indexes...')
  const db = await getDb()

  // --- users ---
  await db.collection('users').createIndexes([
    { key: { email: 1 }, unique: true, name: 'email_unique' },
    { key: { role: 1 }, name: 'role' },
  ])
  console.log('✓ users indexes')

  // --- bookings ---
  await db.collection('bookings').createIndexes([
    { key: { trackingToken: 1 }, unique: true, name: 'trackingToken_unique' },
    { key: { customerId: 1, createdAt: -1 }, name: 'customer_bookings' },
    { key: { assignedDriverId: 1, status: 1 }, name: 'driver_status' },
    { key: { status: 1, createdAt: -1 }, name: 'status_date' },
  ])
  console.log('✓ bookings indexes')

  // --- routes ---
  await db.collection('routes').createIndexes([
    { key: { driverId: 1, isActive: 1 }, name: 'driver_active_route' },
  ])
  console.log('✓ routes indexes')

  // --- location_traces (TTL: auto-delete after 24 hours) ---
  await db.collection('location_traces').createIndexes([
    { key: { createdAt: 1 }, expireAfterSeconds: 86400, name: 'ttl_24h' },
    { key: { driverId: 1, createdAt: -1 }, name: 'driver_traces' },
  ])
  console.log('✓ location_traces indexes (TTL: 24h)')

  console.log('\nDatabase setup complete.')
  process.exit(0)
}

setup().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
