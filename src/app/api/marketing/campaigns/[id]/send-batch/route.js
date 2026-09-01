import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { requireMarketer, handleApiError } from '@/lib/dal'
import { findCampaignById, recordBatchResult, markCampaignFailed } from '@/lib/db/emailCampaigns'
import { findTemplateById } from '@/lib/db/emailTemplates'
import { sendMarketingEmail, isSesConfigured } from '@/lib/ses'
import { fillMergeTags, appendUnsubscribeFooter } from '@/lib/mergeTags'

// Generous headroom for a 25-email batch under SES sandbox's 1/sec throttle
// (worst case ~25s+); production quota is faster but this stays safe either way.
export const maxDuration = 60

// Public URL embedded in the unsubscribe link INSIDE sent emails — real
// recipients click this from their inbox, so it must be the actual public
// domain, never a self-referential/local address.
const PUBLIC_BASE_URL = process.env.APP_BASE_URL ?? 'https://gofastdelivery.ca'

function triggerNextBatch(campaignId, selfOrigin) {
  after(async () => {
    try {
      await fetch(`${selfOrigin}/api/marketing/campaigns/${campaignId}/send-batch`, {
        method: 'POST',
        headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
      })
    } catch (err) {
      // Self-chain broke (e.g. transient network error, deploy mid-flight).
      // The campaign is left in 'sending' with a stale updatedAt — the
      // marketer's campaign page detects this (isCampaignStuck) and offers
      // a manual Resume action, since there's no cron/worker to retry this.
      console.error(`[send-batch] failed to trigger next batch for campaign ${campaignId}`, err)
    }
  })
}

async function processBatch(campaignId, selfOrigin) {
  const campaign = await findCampaignById(campaignId)
  if (!campaign || campaign.status !== 'sending') return // already completed, failed, or never claimed — nothing to do

  if (!isSesConfigured()) {
    await markCampaignFailed(campaignId, 'AWS SES is not configured (missing env vars)')
    return
  }

  const template = await findTemplateById(campaign.templateId)
  if (!template) {
    await markCampaignFailed(campaignId, `Template ${campaign.templateId} no longer exists`)
    return
  }

  const start = campaign.nextIndex
  const end = Math.min(start + campaign.batchSize, campaign.totalRecipients)
  const batch = campaign.recipients.slice(start, end)

  const results = []
  for (let i = 0; i < batch.length; i++) {
    const recipient = batch[i]
    const index = start + i

    // Never re-send to a recipient already marked sent/failed — guards
    // against a batch being processed twice if the chain ever double-fires.
    if (recipient.sendStatus !== 'pending') {
      results.push({ index, sendStatus: recipient.sendStatus, error: recipient.error })
      continue
    }

    let html = fillMergeTags(template.html, recipient)
    html = appendUnsubscribeFooter(html, PUBLIC_BASE_URL, recipient.unsubscribeToken)

    const outcome = await sendMarketingEmail({ to: recipient.email, subject: campaign.subject, html })
    results.push({
      index,
      sendStatus: outcome.success ? 'sent' : 'failed',
      error: outcome.success ? null : outcome.error,
    })
  }

  const { isComplete } = await recordBatchResult(campaignId, { results, newNextIndex: end })

  if (!isComplete) {
    triggerNextBatch(campaignId, selfOrigin)
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params

    // Internal self-chain calls carry no session, so they can't run
    // requireMarketer() — verified instead via a shared secret only the
    // server itself knows. A browser-initiated call (no matching secret)
    // must be an authenticated marketer.
    const internalSecret = request.headers.get('x-internal-secret')
    const isInternalCall = Boolean(internalSecret) && internalSecret === process.env.INTERNAL_API_SECRET
    if (!isInternalCall) {
      await requireMarketer()
    }

    // Derived from the incoming request, NOT an env var — APP_BASE_URL is
    // the public marketing domain (used above for the unsubscribe link),
    // which would make local/preview environments silently call production
    // for the next batch. request.url always reflects whatever host this
    // instance is actually running on (localhost:3000 in dev, the preview
    // URL on a Vercel preview deploy, the real domain in production).
    const selfOrigin = new URL(request.url).origin

    await processBatch(id, selfOrigin)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, '[POST /api/marketing/campaigns/[id]/send-batch]')
  }
}
