import { NextResponse } from 'next/server'
import { requireMarketer, handleApiError } from '@/lib/dal'
import { findCampaignById, isCampaignStuck } from '@/lib/db/emailCampaigns'

export async function GET(request, { params }) {
  try {
    await requireMarketer()
    const { id } = await params
    const campaign = await findCampaignById(id)
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ...JSON.parse(JSON.stringify(campaign)), isStuck: isCampaignStuck(campaign) })
  } catch (err) {
    return handleApiError(err, '[GET /api/marketing/campaigns/[id]]')
  }
}
