import { requireMarketer } from '@/lib/dal'
import { findTemplates } from '@/lib/db/emailTemplates'
import { countSubscribers } from '@/lib/db/marketingSubscribers'
import TemplatesClient from './TemplatesClient'

export const metadata = { title: 'Templates — Go Fast Delivery Inc.' }

export default async function TemplatesPage() {
  await requireMarketer()
  const [templates, subscribedCount] = await Promise.all([
    findTemplates(),
    countSubscribers({ status: 'subscribed' }),
  ])

  return (
    <TemplatesClient
      templates={JSON.parse(JSON.stringify(templates))}
      subscribedCount={subscribedCount}
    />
  )
}
