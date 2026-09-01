import { ObjectId } from 'mongodb'
import { getDb } from './client.js'

const BATCH_SIZE = 25 // conservative: SES sandbox allows 1/sec, so 25 sequential
                       // sends already takes ~25s+ under throttling; production
                       // quota is higher but this stays a safe default either way

export async function createCampaign({ templateId, subject, recipients, createdBy }) {
  const db = await getDb()
  const now = new Date()
  const doc = {
    templateId: new ObjectId(templateId),
    subject,
    status: 'draft',
    // Snapshotted at send time, not a live reference — a later unsubscribe
    // must not retroactively alter a campaign's historical record of who it
    // was actually sent to.
    recipients: recipients.map((r) => ({
      email: r.email, firstName: r.firstName ?? null, lastName: r.lastName ?? null,
      unsubscribeToken: r.unsubscribeToken,
      sendStatus: 'pending', error: null, sentAt: null,
    })),
    batchSize: BATCH_SIZE,
    nextIndex: 0,
    totalRecipients: recipients.length,
    sentCount: 0,
    failedCount: 0,
    createdBy: new ObjectId(createdBy),
    createdAt: now,
    startedAt: null,
    completedAt: null,
    updatedAt: now,
  }
  const result = await db.collection('email_campaigns').insertOne(doc)
  return { ...doc, _id: result.insertedId }
}

export async function findCampaignById(id) {
  const db = await getDb()
  return db.collection('email_campaigns').findOne({ _id: new ObjectId(id) })
}

export async function findCampaigns() {
  const db = await getDb()
  return db.collection('email_campaigns').find().sort({ createdAt: -1 }).toArray()
}

/**
 * Atomically claims a campaign for sending — flips status draft->sending
 * and sets startedAt. Uses findOneAndUpdate with a status filter so two
 * concurrent triggers (e.g. a double-click on Send racing itself) can't
 * both think they're the one driving the send loop.
 */
export async function claimCampaignForSending(id) {
  const db = await getDb()
  return db.collection('email_campaigns').findOneAndUpdate(
    { _id: new ObjectId(id), status: 'draft' },
    { $set: { status: 'sending', startedAt: new Date(), updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
}

/**
 * Records the outcome of one batch: updates each processed recipient's
 * sendStatus/error/sentAt by array index, advances nextIndex, and flips
 * status to 'completed' once nextIndex reaches the end. Read-modify-write
 * on the whole recipients array rather than per-index $set — Mongo can't
 * positionally update multiple distinct array indices in one call, and the
 * whole point of nextIndex is that only one batch is ever in flight for a
 * given campaign at a time, so this isn't racing itself.
 */
export async function recordBatchResult(campaignId, { results, newNextIndex }) {
  const db = await getDb()
  const campaign = await db.collection('email_campaigns').findOne({ _id: new ObjectId(campaignId) })
  if (!campaign) return null

  const recipients = [...campaign.recipients]
  let sentDelta = 0
  let failedDelta = 0
  results.forEach(({ index, sendStatus, error }) => {
    recipients[index] = { ...recipients[index], sendStatus, error, sentAt: sendStatus === 'sent' ? new Date() : null }
    if (sendStatus === 'sent') sentDelta++
    if (sendStatus === 'failed') failedDelta++
  })

  const isComplete = newNextIndex >= campaign.totalRecipients
  await db.collection('email_campaigns').updateOne(
    { _id: new ObjectId(campaignId) },
    {
      $set: {
        recipients,
        nextIndex: newNextIndex,
        updatedAt: new Date(),
        ...(isComplete ? { status: 'completed', completedAt: new Date() } : {}),
      },
      $inc: { sentCount: sentDelta, failedCount: failedDelta },
    }
  )
  return { isComplete }
}

export async function markCampaignFailed(campaignId, error) {
  const db = await getDb()
  await db.collection('email_campaigns').updateOne(
    { _id: new ObjectId(campaignId) },
    { $set: { status: 'failed', lastError: error, updatedAt: new Date() } }
  )
}

/**
 * Campaigns stuck in 'sending' with no progress for over this long are
 * considered abandoned (e.g. the self-chain broke due to a deploy or an
 * uncaught error) — used by the manual "Resume" action on the campaign
 * page, since this app has no cron/worker to auto-resume in the background.
 */
const STUCK_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

export function isCampaignStuck(campaign) {
  if (campaign.status !== 'sending') return false
  return Date.now() - new Date(campaign.updatedAt).getTime() > STUCK_THRESHOLD_MS
}
