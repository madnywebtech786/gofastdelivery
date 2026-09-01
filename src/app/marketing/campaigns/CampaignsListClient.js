'use client'

import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { calgaryDateKey } from '@/lib/dateFormat'
import { Send, CheckCircle2, XCircle, Loader2, FileText, AlertTriangle, Plus } from 'lucide-react'

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     icon: FileText,     color: 'var(--fg-3)' },
  sending:   { label: 'Sending',   icon: Loader2,       color: 'var(--accent)' },
  completed: { label: 'Completed', icon: CheckCircle2,  color: 'var(--accent)' },
  failed:    { label: 'Failed',    icon: AlertTriangle, color: 'var(--danger)' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  const Icon = cfg.icon
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full"
      style={{ background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`, color: cfg.color }}>
      <Icon size={11} className={status === 'sending' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  )
}

export default function CampaignsListClient({ campaigns }) {
  const router = useRouter()

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6 anim-fade-up">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Campaigns</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--fg-3)' }}>
            {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} sent
          </p>
        </div>
        <a href="/marketing/campaigns/new">
          <Button variant="primary" size="sm" icon={<Plus size={14} />}>New Campaign</Button>
        </a>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-border bg-white py-20 text-center anim-fade-up s1">
          <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
            <Send size={22} style={{ color: 'var(--fg-3)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>No campaigns sent yet.</p>
          <a href="/marketing/campaigns/new" className="mt-3 inline-block text-sm font-semibold" style={{ color: 'var(--accent)' }}>
            Create your first campaign →
          </a>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white overflow-hidden anim-fade-up s1">
          <div className="hidden sm:block overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Status</th>
                  <th className="hidden md:table-cell">Sent / Failed</th>
                  <th className="hidden md:table-cell">Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c, i) => (
                  <tr key={c._id} className={`anim-fade-up s${Math.min(i + 1, 6)}`}>
                    <td>
                      <p className="font-semibold text-sm" style={{ color: 'var(--fg)' }}>{c.subject}</p>
                      <p className="text-xs" style={{ color: 'var(--fg-3)' }}>{c.totalRecipients} recipient{c.totalRecipients !== 1 ? 's' : ''}</p>
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="hidden md:table-cell">
                      <span className="text-xs" style={{ color: 'var(--fg-2)' }}>
                        <CheckCircle2 size={11} className="inline mr-1" style={{ color: 'var(--accent)' }} />{c.sentCount}
                        <XCircle size={11} className="inline ml-3 mr-1" style={{ color: 'var(--danger)' }} />{c.failedCount}
                      </span>
                    </td>
                    <td className="hidden md:table-cell">
                      <span className="text-xs" style={{ color: 'var(--fg-3)' }}>{calgaryDateKey(c.createdAt)}</span>
                    </td>
                    <td className="text-right">
                      <button onClick={() => router.push(`/marketing/campaigns/${c._id}`)}
                        className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden divide-y divide-border">
            {campaigns.map((c) => (
              <button key={c._id} onClick={() => router.push(`/marketing/campaigns/${c._id}`)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--fg)' }}>{c.subject}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3)' }}>{calgaryDateKey(c.createdAt)} · {c.totalRecipients} recipients</p>
                </div>
                <StatusBadge status={c.status} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
