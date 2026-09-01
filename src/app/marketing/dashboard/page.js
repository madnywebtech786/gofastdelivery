import { requireMarketer } from '@/lib/dal'
import { getMarketingStats } from '@/lib/db/marketingStats'
import { findCampaigns } from '@/lib/db/emailCampaigns'
import { Users, UserX, Send, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'Marketing Dashboard — Go Fast Delivery Inc.' }

export default async function MarketingDashboardPage() {
  await requireMarketer()
  const [stats, campaigns] = await Promise.all([
    getMarketingStats(),
    findCampaigns(),
  ])

  const CARDS = [
    { label: 'Subscribed',   value: stats.subscribed,   icon: Users,         color: 'var(--accent)' },
    { label: 'Unsubscribed', value: stats.unsubscribed, icon: UserX,         color: 'var(--fg-3)' },
    { label: 'Emails Sent',  value: stats.totalSent,    icon: Send,          color: 'var(--accent)' },
    { label: 'Failed Sends', value: stats.totalFailed,  icon: AlertTriangle, color: 'var(--danger)' },
  ]

  const recentCampaigns = campaigns.slice(0, 5)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 anim-fade-up" style={{ color: 'var(--fg)' }}>Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 anim-fade-up s1">
        {CARDS.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="p-4 rounded-xl bg-white border border-border">
            <Icon size={18} style={{ color }} className="mb-2" />
            <p className="text-2xl font-black" style={{ color: 'var(--fg)' }}>{value}</p>
            <p className="text-xs" style={{ color: 'var(--fg-3)' }}>{label}</p>
          </div>
        ))}
      </div>

      <div className="anim-fade-up s2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold" style={{ color: 'var(--fg)' }}>Recent Campaigns</h2>
          <Link href="/marketing/campaigns" className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>View all →</Link>
        </div>

        {recentCampaigns.length === 0 ? (
          <div className="rounded-xl border border-border bg-white py-10 text-center">
            <p className="text-sm" style={{ color: 'var(--fg-3)' }}>No campaigns sent yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-white overflow-hidden divide-y divide-border">
            {recentCampaigns.map((c) => (
              <Link key={c._id.toString()} href={`/marketing/campaigns/${c._id}`}
                className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--fg)' }}>{c.subject}</p>
                  <p className="text-xs" style={{ color: 'var(--fg-3)' }}>{c.sentCount}/{c.totalRecipients} sent</p>
                </div>
                <span className="text-xs font-semibold capitalize shrink-0" style={{ color: 'var(--fg-3)' }}>{c.status}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
