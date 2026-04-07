import { MongoClient } from 'mongodb'

const DB_NAME = 'courier'

let clientPromise

export function getClientPromise() {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error('MONGODB_URI is not set')
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
    })
    clientPromise = client.connect()
  }
  return clientPromise
}

export async function getDb() {
  const client = await getClientPromise()
  return client.db(DB_NAME)
}
