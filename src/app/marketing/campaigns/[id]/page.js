import { notFound } from 'next/navigation'
import { requireMarketer } from '@/lib/dal'
import { findCampaignById, isCampaignStuck } from '@/lib/db/emailCampaigns'
import CampaignProgressClient from './CampaignProgressClient'

export const metadata = { title: 'Campaign — Go Fast Delivery Inc.' }

export default async function CampaignPage({ params }) {
  await requireMarketer()
  const { id } = await params
  const campaign = await findCampaignById(id)
  if (!campaign) notFound()

  return (
    <CampaignProgressClient
      campaignId={id}
      initial={{ ...JSON.parse(JSON.stringify(campaign)), isStuck: isCampaignStuck(campaign) }}
    />
  )
}
