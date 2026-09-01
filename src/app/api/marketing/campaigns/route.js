import { NextResponse } from 'next/server'
import { requireMarketer, handleApiError } from '@/lib/dal'
import { findTemplateById } from '@/lib/db/emailTemplates'
import { resolveSelectedRecipients } from '@/lib/db/marketingSubscribers'
import { createCampaign, claimCampaignForSending, findCampaigns } from '@/lib/db/emailCampaigns'
import { isSesConfigured } from '@/lib/ses'

export async function GET() {
  try {
    await requireMarketer()
    const campaigns = await findCampaigns()
    // Recipient list can be large and isn't needed for the list view —
    // strip it here rather than adding a second DB query path just for this.
    const summarized = campaigns.map(({ recipients, ...rest }) => rest)
    return NextResponse.json(JSON.parse(JSON.stringify(summarized)))
  } catch (err) {
    return handleApiError(err, '[GET /api/marketing/campaigns]')
  }
}

export async function POST(request) {
  try {
    const { userId } = await requireMarketer()
    const { templateId, subject, selection } = await request.json()

    if (!templateId || !subject?.trim()) {
      return NextResponse.json({ error: 'Template and subject are required' }, { status: 400 })
    }
    if (!selection?.mode || !['include', 'exclude'].includes(selection.mode)) {
      return NextResponse.json({ error: 'A recipient selection is required' }, { status: 400 })
    }
    if (!isSesConfigured()) {
      return NextResponse.json({ error: 'AWS SES is not configured yet. Add AWS_SES_* environment variables before sending campaigns.' }, { status: 400 })
    }

    const template = await findTemplateById(templateId)
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Re-resolved from the selection description, not trusted from the
    // client as a literal list — see resolveSelectedRecipients() for why
    // (a subscriber who unsubscribed between opening the picker and
    // clicking Send must never receive the email).
    const subscribers = await resolveSelectedRecipients({
      mode: selection.mode,
      ids: selection.ids ?? [],
      search: selection.search ?? '',
      status: selection.status ?? '',
    })
    if (subscribers.length === 0) {
      return NextResponse.json({ error: 'No eligible recipients in this selection' }, { status: 400 })
    }

    const campaign = await createCampaign({ templateId, subject: subject.trim(), recipients: subscribers, createdBy: userId })
    await claimCampaignForSending(campaign._id)

    // Kick off the first batch — fire and forget. The client gets an
    // immediate response and polls the campaign status page for progress;
    // this fetch is intentionally not awaited so campaign creation doesn't
    // block on however long the first batch of SES calls takes.
    // Origin is derived from this request, not APP_BASE_URL (the public
    // marketing domain) — see send-batch/route.js for why.
    const selfOrigin = new URL(request.url).origin
    fetch(`${selfOrigin}/api/marketing/campaigns/${campaign._id}/send-batch`, {
      method: 'POST',
      headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
    }).catch((err) => console.error('[POST /api/marketing/campaigns] failed to trigger first batch', err))

    return NextResponse.json({ campaignId: campaign._id, totalRecipients: subscribers.length }, { status: 201 })
  } catch (err) {
    return handleApiError(err, '[POST /api/marketing/campaigns]')
  }
}
