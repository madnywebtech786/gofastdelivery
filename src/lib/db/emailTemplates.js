import { ObjectId } from 'mongodb'
import { getDb } from './client.js'

export async function findTemplates() {
  const db = await getDb()
  return db.collection('email_templates').find().sort({ updatedAt: -1 }).toArray()
}

export async function findTemplateById(id) {
  const db = await getDb()
  return db.collection('email_templates').findOne({ _id: new ObjectId(id) })
}

export async function createTemplate({ name, design, html, createdBy }) {
  const db = await getDb()
  const now = new Date()
  const doc = { name, design, html, createdBy: new ObjectId(createdBy), createdAt: now, updatedAt: now }
  const result = await db.collection('email_templates').insertOne(doc)
  return { ...doc, _id: result.insertedId }
}

export async function updateTemplate(id, { name, design, html }) {
  const db = await getDb()
  await db.collection('email_templates').updateOne(
    { _id: new ObjectId(id) },
    { $set: { name, design, html, updatedAt: new Date() } }
  )
  return findTemplateById(id)
}

export async function deleteTemplate(id) {
  const db = await getDb()
  return db.collection('email_templates').deleteOne({ _id: new ObjectId(id) })
}
