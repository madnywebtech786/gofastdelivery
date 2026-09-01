import { NextResponse } from 'next/server'
import { requireMarketer, handleApiError } from '@/lib/dal'
import { findCampaignById, isCampaignStuck } from '@/lib/db/emailCampaigns'

/**
 * Manually re-triggers the next batch of a campaign that stalled mid-send
 * (self-chain broke — see send-batch/route.js). There's no cron/worker in
 * this app to auto-retry, so this is the marketer-facing recovery action,
 * surfaced on the campaign page once isCampaignStuck() is true.
 */
export async function POST(request, { params }) {
  try {
    await requireMarketer()
    const { id } = await params
    const campaign = await findCampaignById(id)
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (campaign.status !== 'sending') {
      return NextResponse.json({ error: 'Campaign is not in a resumable state' }, { status: 400 })
    }
    if (!isCampaignStuck(campaign)) {
      return NextResponse.json({ error: 'Campaign is still actively sending, not stuck' }, { status: 400 })
    }

    // Derived from this request, not APP_BASE_URL — see send-batch/route.js.
    const selfOrigin = new URL(request.url).origin
    const res = await fetch(`${selfOrigin}/api/marketing/campaigns/${id}/send-batch`, {
      method: 'POST',
      headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to resume campaign' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, '[POST /api/marketing/campaigns/[id]/resume]')
  }
}
