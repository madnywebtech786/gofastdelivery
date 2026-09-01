import { notFound } from 'next/navigation'
import { requireMarketer } from '@/lib/dal'
import { findTemplateById, findTemplates } from '@/lib/db/emailTemplates'
import { findSubscribers, countSubscribers } from '@/lib/db/marketingSubscribers'
import NewCampaignClient from './NewCampaignClient'

export const metadata = { title: 'New Campaign — Go Fast Delivery Inc.' }

const PAGE_SIZE = 25

export default async function NewCampaignPage({ searchParams }) {
  await requireMarketer()
  const params = await searchParams
  const templateId = params.templateId

  // No template chosen yet — this is reached directly from the Campaigns
  // page's "New Campaign" button, so show the template-picker step first
  // instead of 404ing (the templateId-provided entry from a template row's
  // "Send" link skips straight past this).
  if (!templateId) {
    const templates = await findTemplates()
    return <NewCampaignClient template={null} templates={JSON.parse(JSON.stringify(templates))} />
  }

  const template = await findTemplateById(templateId)
  if (!template) notFound()

  const [subscribers, total] = await Promise.all([
    findSubscribers({ limit: PAGE_SIZE, skip: 0 }),
    countSubscribers({}),
  ])

  return (
    <NewCampaignClient
      template={{ _id: templateId, name: template.name }}
      initialSubscribers={JSON.parse(JSON.stringify(subscribers))}
      initialTotal={total}
      pageSize={PAGE_SIZE}
    />
  )
}
