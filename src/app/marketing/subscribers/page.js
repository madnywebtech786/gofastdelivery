import { requireMarketer } from '@/lib/dal'
import { findSubscribers, countSubscribers } from '@/lib/db/marketingSubscribers'
import SubscribersClient from './SubscribersClient'

export const metadata = { title: 'Subscribers — Go Fast Delivery Inc.' }

const PAGE_SIZE = 25

export default async function SubscribersPage({ searchParams }) {
  await requireMarketer()
  const params = await searchParams
  const page   = Math.max(1, parseInt(params.page ?? '1'))
  const search = params.search ?? ''
  const status = params.status ?? ''
  const skip   = (page - 1) * PAGE_SIZE

  const [subscribers, total] = await Promise.all([
    findSubscribers({ search, status, limit: PAGE_SIZE, skip }),
    countSubscribers({ search, status }),
  ])

  return (
    <SubscribersClient
      subscribers={JSON.parse(JSON.stringify(subscribers))}
      total={total}
      page={page}
      search={search}
      status={status}
    />
  )
}
