import { getDb } from './client.js'

export async function getMarketingStats() {
  const db = await getDb()

  const [subscriberFacet, campaignFacet] = await Promise.all([
    db.collection('marketing_subscribers').aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('email_campaigns').aggregate([
      { $group: { _id: null, totalSent: { $sum: '$sentCount' }, totalFailed: { $sum: '$failedCount' }, campaignCount: { $sum: 1 } } },
    ]).toArray(),
  ])

  const subscribed   = subscriberFacet.find((s) => s._id === 'subscribed')?.count ?? 0
  const unsubscribed = subscriberFacet.find((s) => s._id === 'unsubscribed')?.count ?? 0
  const campaigns     = campaignFacet[0] ?? { totalSent: 0, totalFailed: 0, campaignCount: 0 }

  return {
    subscribed,
    unsubscribed,
    totalSubscribers: subscribed + unsubscribed,
    totalSent: campaigns.totalSent,
    totalFailed: campaigns.totalFailed,
    campaignCount: campaigns.campaignCount,
  }
}
