import { MongoClient } from 'mongodb'

const DB_NAME = 'courier'

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is not set')
}

const uri = process.env.MONGODB_URI
const options = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
}

// Reuse the MongoClient across hot reloads in development
// In production (serverless), each invocation may get a new instance
let client
let clientPromise

if (process.env.NODE_ENV === 'development') {
  // Use a global variable in dev to preserve across HMR reloads
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise
} else {
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

/**
 * Returns a handle to the 'courier' database.
 * Reuses the existing connection if already established.
 */
export async function getDb() {
  const client = await clientPromise
  return client.db(DB_NAME)
}

export default clientPromise
