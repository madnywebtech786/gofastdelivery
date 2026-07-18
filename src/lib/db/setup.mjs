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

// Dynamic import, not static — client.js throws at import time if
// MONGODB_URI is unset, and ESM hoists static imports above the config()
// call above, which would make the throw fire before dotenv ever runs.
async function setup() {
  const { getDb } = await import('./client.js')
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
    // Covers delivered_today filter (findAllBookings/countAllBookings sinceDate on updatedAt)
    { key: { status: 1, updatedAt: -1 }, name: 'status_updated' },
    // Covers getDriverStats delivered-today count (assignedDriverId + status + updatedAt)
    { key: { assignedDriverId: 1, status: 1, updatedAt: -1 }, name: 'driver_status_updated' },
    // Covers getDashboardStats trailing-window $match on createdAt alone
    { key: { createdAt: -1 }, name: 'createdAt_desc' },
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

  // --- invoices ---
  await db.collection('invoices').createIndexes([
    { key: { invoiceNumber: 1 }, unique: true, sparse: true, name: 'invoiceNumber_unique' },
    { key: { clientName: 1 }, name: 'clientName' },
    { key: { clientEmail: 1 }, name: 'clientEmail' },
    { key: { status: 1 }, name: 'status' },
    { key: { createdAt: -1 }, name: 'createdAt_desc' },
  ])
  console.log('✓ invoices indexes')

  // --- password_reset_otps (TTL: auto-delete on expiry; one doc per email) ---
  await db.collection('password_reset_otps').createIndexes([
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'ttl_expiry' },
    { key: { email: 1 }, unique: true, name: 'email_unique' },
  ])
  console.log('✓ password_reset_otps indexes')

  // --- cities (pricing zone registry) ---
  await db.collection('cities').createIndexes([
    { key: { nameKey: 1 }, unique: true, name: 'nameKey_unique' },
  ])
  console.log('✓ cities indexes')

  // --- pricing_rules (one row per unordered city pair) ---
  await db.collection('pricing_rules').createIndexes([
    { key: { cityAKey: 1, cityBKey: 1 }, unique: true, name: 'city_pair_unique' },
  ])
  console.log('✓ pricing_rules indexes')

  console.log('\nDatabase setup complete.')
  process.exit(0)
}

setup().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
