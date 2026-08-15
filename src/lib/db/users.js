import { ObjectId } from 'mongodb'
import { getDb } from './client.js'

/**
 * Find a user by email (for login).
 * Returns the full user doc including passwordHash.
 */
export async function findUserByEmail(email) {
  const db = await getDb()
  return db.collection('users').findOne({ email: email.toLowerCase().trim() })
}

/**
 * Find a user by ID (no passwordHash returned).
 */
export async function findUserById(id) {
  const db = await getDb()
  return db
    .collection('users')
    .findOne({ _id: new ObjectId(id) }, { projection: { passwordHash: 0 } })
}

/**
 * List all users with a specific role.
 */
export async function findUsersByRole(role) {
  const db = await getDb()
  return db
    .collection('users')
    .find({ role, isActive: true }, { projection: { passwordHash: 0 } })
    .sort({ name: 1 })
    .toArray()
}

function buildCustomerFilter(search) {
  const base = { role: 'customer', isActive: true }
  if (!search?.trim()) return base
  // Escaped: the raw input goes straight into a regex, so an unescaped "("
  // or "+" (a plausible thing to type when searching a phone number) would
  // throw a regex-compile error and 500 the page rather than just not match.
  const re = { $regex: escapeRegex(search.trim()), $options: 'i' }
  return {
    ...base,
    $or: [{ name: re }, { email: re }, { phone: re }, { accountNumber: re }],
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function findCustomers({ search = '', limit = 20, skip = 0 } = {}) {
  const db = await getDb()
  const filter = buildCustomerFilter(search)
  return db
    .collection('users')
    .find(filter, { projection: { passwordHash: 0 } })
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .toArray()
}

export async function countCustomers({ search = '' } = {}) {
  const db = await getDb()
  return db.collection('users').countDocuments(buildCustomerFilter(search))
}

/**
 * Create a new user. passwordHash must already be bcrypt-hashed.
 */
// Customer-facing account number, e.g. "GFD-0042". Sequential in signup
// order, never reused, never reset. Only customers get one — drivers and
// admins are internal and are identified by name in the UI.
const ACCOUNT_PREFIX = 'GFD-'
const ACCOUNT_RE     = /^GFD-\d+$/

/**
 * Next free account number. Same approach as getNextInvoiceNumber(): pull the
 * existing numbers and take the numeric max in JS rather than sorting in
 * Mongo, because a lexicographic sort would rank "GFD-0999" above "GFD-1000"
 * once the sequence crosses a digit-width boundary. Customer counts are in
 * the hundreds/thousands and the field is indexed, so this stays cheap.
 *
 * This is a read-then-increment, so two simultaneous signups can compute the
 * same number — the unique index rejects the loser and the caller retries
 * (see the register route), which is the same pattern invoices use.
 */
export async function getNextAccountNumber() {
  const db = await getDb()
  const docs = await db.collection('users')
    .find({ accountNumber: { $regex: ACCOUNT_RE } }, { projection: { accountNumber: 1 } })
    .toArray()

  let next = 1
  for (const doc of docs) {
    const num = parseInt(doc.accountNumber.slice(ACCOUNT_PREFIX.length), 10)
    if (!isNaN(num) && num + 1 > next) next = num + 1
  }
  return `${ACCOUNT_PREFIX}${String(next).padStart(4, '0')}`
}

/**
 * Resolve a set of customer IDs to their display account info, in ONE query.
 * Used to label bookings with who actually placed them — bookings only store
 * customerId, and the contact name on a stop is whoever is at that address,
 * not necessarily the account holder.
 *
 * Returns a Map keyed by the string customer id. Accounts created before
 * account numbers existed simply have accountNumber: null; callers render a
 * fallback rather than hiding the name.
 */
export async function findAccountsByIds(customerIds) {
  const ids = [...new Set(customerIds.filter(Boolean).map(String))]
  if (ids.length === 0) return new Map()

  const db = await getDb()
  const users = await db.collection('users')
    .find(
      { _id: { $in: ids.map((id) => new ObjectId(id)) } },
      { projection: { name: 1, companyName: 1, accountNumber: 1 } }
    )
    .toArray()

  return new Map(users.map((u) => [String(u._id), {
    name:          u.name ?? null,
    companyName:   u.companyName ?? null,
    accountNumber: u.accountNumber ?? null,
  }]))
}

export async function createUser({ email, passwordHash, name, role, phone, accountNumber = null, driverProfile = null }) {
  const db = await getDb()
  const now = new Date()
  const doc = {
    email: email.toLowerCase().trim(),
    passwordHash,
    name,
    role,
    phone: phone || null,
    isActive: true,
    // Customers only — see getNextAccountNumber(). Null for drivers/admins,
    // and the index is sparse so any number of them can coexist.
    ...(accountNumber ? { accountNumber } : {}),
    driverProfile,
    createdAt: now,
    updatedAt: now,
  }
  const result = await db.collection('users').insertOne(doc)
  return { ...doc, _id: result.insertedId }
}

/**
 * Update a driver's on-duty status and current location.
 */
export async function updateDriverLocation(driverId, { lat, lng }) {
  const db = await getDb()
  return db.collection('users').updateOne(
    { _id: new ObjectId(driverId), role: 'driver' },
    {
      $set: {
        'driverProfile.currentLocation': { lat, lng, updatedAt: new Date() },
        updatedAt: new Date(),
      },
    }
  )
}

/**
 * Set a driver's on-duty status.
 */
export async function setDriverOnDuty(driverId, isOnDuty) {
  const db = await getDb()
  return db.collection('users').updateOne(
    { _id: new ObjectId(driverId), role: 'driver' },
    { $set: { 'driverProfile.isOnDuty': isOnDuty, updatedAt: new Date() } }
  )
}

/**
 * Check if an email is already registered.
 */
export async function emailExists(email) {
  const db = await getDb()
  const count = await db
    .collection('users')
    .countDocuments({ email: email.toLowerCase().trim() })
  return count > 0
}

/**
 * Update a user's profile info.
 * For customers: name, email, phone, contactName, companyName, address, profile (updated flag).
 * For admins: name, email, phone, address.
 * Returns the updated doc (no passwordHash).
 */
export async function updateUserProfile(userId, fields) {
  const db = await getDb()
  const now = new Date()
  const allowed = ['name', 'phone', 'address', 'contactName', 'companyName', 'profileUpdated']
  const setFields = { updatedAt: now }
  for (const key of allowed) {
    if (key in fields) setFields[key] = fields[key]
  }
  await db.collection('users').updateOne(
    { _id: new ObjectId(userId) },
    { $set: setFields }
  )
  return db.collection('users').findOne(
    { _id: new ObjectId(userId) },
    { projection: { passwordHash: 0 } }
  )
}

/**
 * Update a driver's name/email/phone (admin-driven edit, distinct from the
 * self-service updateUserProfile — that one has no driver field allow-list
 * and email isn't editable there). Caller must check email uniqueness first
 * via emailExists() if email is being changed. Returns the updated doc.
 */
export async function updateDriverInfo(driverId, { name, email, phone }) {
  const db = await getDb()
  const setFields = { updatedAt: new Date() }
  if (name != null)  setFields.name  = name
  if (email != null) setFields.email = email.toLowerCase().trim()
  if (phone != null) setFields.phone = phone || null
  await db.collection('users').updateOne(
    { _id: new ObjectId(driverId), role: 'driver' },
    { $set: setFields }
  )
  return db.collection('users').findOne(
    { _id: new ObjectId(driverId) },
    { projection: { passwordHash: 0 } }
  )
}

/**
 * Update a user's password. Caller must verify the old password first.
 */
export async function updateUserPassword(userId, newPasswordHash) {
  const db = await getDb()
  return db.collection('users').updateOne(
    { _id: new ObjectId(userId) },
    { $set: { passwordHash: newPasswordHash, updatedAt: new Date() } }
  )
}

/**
 * Reset a user's password by userId string (used in forgot-password flow).
 * Caller is responsible for verifying the reset token before calling this.
 */
export async function resetPasswordByUserId(userId, newPasswordHash) {
  const db = await getDb()
  return db.collection('users').updateOne(
    { _id: new ObjectId(userId), isActive: true },
    { $set: { passwordHash: newPasswordHash, updatedAt: new Date() } }
  )
}
