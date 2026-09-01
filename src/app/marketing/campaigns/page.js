import { requireMarketer } from '@/lib/dal'
import { findCampaigns } from '@/lib/db/emailCampaigns'
import CampaignsListClient from './CampaignsListClient'

export const metadata = { title: 'Campaigns — Go Fast Delivery Inc.' }

export default async function CampaignsPage() {
  await requireMarketer()
  const campaigns = await findCampaigns()
  const summarized = campaigns.map(({ recipients, ...rest }) => rest)

  return <CampaignsListClient campaigns={JSON.parse(JSON.stringify(summarized))} />
}
