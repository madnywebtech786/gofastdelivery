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

/**
 * Create a new user. passwordHash must already be bcrypt-hashed.
 */
export async function createUser({ email, passwordHash, name, role, phone, driverProfile = null }) {
  const db = await getDb()
  const now = new Date()
  const doc = {
    email: email.toLowerCase().trim(),
    passwordHash,
    name,
    role,
    phone: phone || null,
    isActive: true,
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
