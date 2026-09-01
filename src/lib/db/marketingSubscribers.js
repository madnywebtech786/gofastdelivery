import { ObjectId } from 'mongodb'
import { randomUUID } from 'crypto'
import { getDb } from './client.js'

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeEmail(email) {
  return String(email ?? '').toLowerCase().trim()
}

function buildSubscriberFilter({ search = '', status = '' } = {}) {
  const filter = {}
  if (status) filter.status = status
  if (search?.trim()) {
    const re = { $regex: escapeRegex(search.trim()), $options: 'i' }
    filter.$or = [{ email: re }, { firstName: re }, { lastName: re }]
  }
  return filter
}

export async function findSubscribers({ search = '', status = '', limit = 20, skip = 0 } = {}) {
  const db = await getDb()
  return db.collection('marketing_subscribers')
    .find(buildSubscriberFilter({ search, status }))
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray()
}

export async function countSubscribers({ search = '', status = '' } = {}) {
  const db = await getDb()
  return db.collection('marketing_subscribers').countDocuments(buildSubscriberFilter({ search, status }))
}

/**
 * All currently subscribed emails — used as the default recipient set when
 * no explicit selection is provided.
 * Projected to just the fields the send loop and merge-tag filler need.
 */
export async function findAllSubscribedEmails() {
  const db = await getDb()
  return db.collection('marketing_subscribers')
    .find({ status: 'subscribed' }, { projection: { email: 1, firstName: 1, lastName: 1, unsubscribeToken: 1 } })
    .toArray()
}

/**
 * Resolves a recipient-picker selection into the actual list of subscriber
 * docs to send to. The picker UI never has to hold every matching row in
 * the browser at once — it only tracks a small set of individually toggled
 * exceptions against a filter, and this resolves the rest server-side.
 *
 * mode 'include': exactly the subscribers in `ids` (the marketer
 *   individually checked specific rows, filter is ignored).
 * mode 'exclude': every subscriber matching {search, status} EXCEPT the
 *   ones in `ids` (the marketer clicked "select all N matching" then
 *   unchecked a few).
 *
 * Always re-applies status/filter server-side rather than trusting
 * whatever the browser last saw — a subscriber who unsubscribed between
 * the picker being opened and Send being clicked must never receive the
 * email just because they were checked a moment earlier.
 */
export async function resolveSelectedRecipients({ mode, ids = [], search = '', status = '' }) {
  const db = await getDb()
  const objectIds = ids.map((id) => new ObjectId(id))
  const projection = { email: 1, firstName: 1, lastName: 1, unsubscribeToken: 1, status: 1 }

  if (mode === 'include') {
    if (objectIds.length === 0) return []
    return db.collection('marketing_subscribers')
      .find({ _id: { $in: objectIds }, status: 'subscribed' }, { projection })
      .toArray()
  }

  // mode === 'exclude'. If the picker's own status filter was anything
  // other than "subscribed" (e.g. the marketer filtered to "Unsubscribed"
  // just to review who opted out), that can never resolve to a real send
  // target — return empty rather than silently emailing ineligible people.
  if (status && status !== 'subscribed') return []

  const filter = buildSubscriberFilter({ search, status: 'subscribed' })
  if (objectIds.length > 0) filter._id = { $nin: objectIds }
  return db.collection('marketing_subscribers').find(filter, { projection }).toArray()
}

/**
 * Insert or update one subscriber by email (upsert). Used by both manual
 * add and Excel import so re-importing the same email never creates a
 * duplicate row — it just refreshes name fields and leaves status alone
 * (an existing unsubscribe must never be silently reversed by a re-import).
 */
export async function upsertSubscriber({ email, firstName = null, lastName = null, source = 'manual', customerId = null, importBatchId = null }) {
  const db = await getDb()
  const now = new Date()
  const normalizedEmail = normalizeEmail(email)

  return db.collection('marketing_subscribers').findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: { firstName, lastName, updatedAt: now },
      $setOnInsert: {
        email: normalizedEmail,
        status: 'subscribed',
        source,
        customerId,
        importBatchId,
        unsubscribeToken: randomUUID(),
        unsubscribedAt: null,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' }
  )
}

export async function setSubscriberStatus(subscriberId, status) {
  const db = await getDb()
  const now = new Date()
  return db.collection('marketing_subscribers').updateOne(
    { _id: new ObjectId(subscriberId) },
    { $set: { status, updatedAt: now, unsubscribedAt: status === 'unsubscribed' ? now : null } }
  )
}

/**
 * Unsubscribe by token — used by the public one-click unsubscribe link in
 * every campaign email. No auth: the token itself is the credential,
 * standard practice for email unsubscribe links (CASL/CAN-SPAM require
 * unsubscribe to work without requiring login).
 */
export async function unsubscribeByToken(token) {
  const db = await getDb()
  const now = new Date()
  const result = await db.collection('marketing_subscribers').updateOne(
    { unsubscribeToken: token },
    { $set: { status: 'unsubscribed', unsubscribedAt: now, updatedAt: now } }
  )
  return result.matchedCount > 0
}

export async function deleteSubscriber(subscriberId) {
  const db = await getDb()
  return db.collection('marketing_subscribers').deleteOne({ _id: new ObjectId(subscriberId) })
}
