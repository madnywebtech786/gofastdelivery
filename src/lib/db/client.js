import { MongoClient } from 'mongodb'

// APP_ENV selects which database this instance talks to:
//   development / testing -> TESTING_MONGODB_URI (staging cluster)
//   production, or unset  -> MONGODB_URI (real production cluster)
// Unset defaults to production so existing deploys that haven't set APP_ENV
// yet keep connecting exactly where they already do today.
const appEnv = process.env.APP_ENV ?? 'production'
const usesTestingDb = appEnv === 'development' || appEnv === 'testing'

const uriEnvVar = usesTestingDb ? 'TESTING_MONGODB_URI' : 'MONGODB_URI'
if (!process.env[uriEnvVar]) {
  throw new Error(`${uriEnvVar} environment variable is not set (APP_ENV=${appEnv})`)
}

const uri = process.env[uriEnvVar]
const options = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
}

// In development: reuse across HMR reloads via a global.
// In production (Vercel serverless): connect lazily so a transient Atlas
// blip at cold-start doesn't permanently poison the module-level promise.
// A failed connect() is not retried — the rejected promise would be cached
// forever on the Lambda instance. Lazy init lets the next request retry.
let clientPromise

function getClientPromise() {
  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      const c = new MongoClient(uri, options)
      global._mongoClientPromise = c.connect()
    }
    return global._mongoClientPromise
  }

  // Production: create a fresh promise each time the module-level cache is
  // empty. The cache is cleared on connect failure so the next request retries.
  if (!clientPromise) {
    const c = new MongoClient(uri, options)
    clientPromise = c.connect().catch((err) => {
      clientPromise = null  // allow retry on next request
      return Promise.reject(err)
    })
  }
  return clientPromise
}

/**
 * Returns a handle to the database named in the selected URI's path segment
 * (client.db() with no argument uses that name automatically).
 * Reuses the existing connection if already established.
 */
export async function getDb() {
  const client = await getClientPromise()
  return client.db()
}

export default getClientPromise
