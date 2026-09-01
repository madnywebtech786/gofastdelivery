'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { CheckCircle2, XCircle, Loader2, AlertTriangle, ArrowLeft, RefreshCw, Send, PartyPopper, Users } from 'lucide-react'

const STATUS_CONFIG = {
  draft:     { label: 'Draft',       icon: Send,         color: 'var(--fg-3)' },
  sending:   { label: 'Sending…',    icon: Loader2,      color: 'var(--accent)' },
  completed: { label: 'Completed',   icon: CheckCircle2, color: 'var(--accent)' },
  failed:    { label: 'Failed',      icon: AlertTriangle, color: 'var(--danger)' },
}

export default function CampaignProgressClient({ campaignId, initial }) {
  const router = useRouter()
  const [campaign, setCampaign] = useState(initial)
  const [resuming, setResuming] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/marketing/campaigns/${campaignId}`)
    if (res.ok) setCampaign(await res.json())
  }, [campaignId])

  useEffect(() => {
    if (campaign.status !== 'sending') return
    const interval = setInterval(refresh, 3000)
    return () => clearInterval(interval)
  }, [campaign.status, refresh])

  async function handleResume() {
    setResuming(true)
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/resume`, { method: 'POST' })
      if (res.ok) await refresh()
    } finally {
      setResuming(false)
    }
  }

  const percent = campaign.totalRecipients > 0
    ? Math.round((campaign.nextIndex / campaign.totalRecipients) * 100)
    : 0
  const isSending   = campaign.status === 'sending'
  const isCompleted = campaign.status === 'completed'
  const isFailed    = campaign.status === 'failed'
  const cfg = STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG.draft
  const StatusIcon = cfg.icon

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6 anim-fade-up">
        <button onClick={() => router.push('/marketing/campaigns')}
          className="p-1.5 rounded-lg transition-colors hover:bg-(--surface-2) shrink-0"
          style={{ color: 'var(--fg-3)' }}>
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fg-3)' }}>Campaign</p>
          <h1 className="text-xl font-bold leading-tight" style={{ color: 'var(--fg)' }}>{campaign.subject}</h1>
        </div>
        <div className="w-[30px] shrink-0" />
      </div>

      {/* Hero status card */}
      <div className="rounded-2xl border border-border bg-white overflow-hidden anim-fade-up s1"
        style={{ boxShadow: isSending ? '0 8px 30px color-mix(in srgb, var(--accent) 12%, transparent)' : '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="p-6 flex flex-col items-center text-center gap-3"
          style={{ background: isCompleted && campaign.failedCount === 0 ? 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, white), white)' : undefined }}>

          <div className="w-16 h-16 rounded-2xl flex items-center justify-center relative"
            style={{ background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`, border: `1.5px solid color-mix(in srgb, ${cfg.color} 25%, transparent)` }}>
            {isCompleted && campaign.failedCount === 0 ? (
              <PartyPopper size={28} style={{ color: cfg.color }} strokeWidth={1.75} />
            ) : (
              <StatusIcon size={28} className={isSending ? 'animate-spin' : ''} style={{ color: cfg.color }} strokeWidth={1.75} />
            )}
            {isSending && (
              <span className="absolute inset-0 rounded-2xl animate-ping" style={{ background: cfg.color, opacity: 0.15 }} />
            )}
          </div>

          <div>
            <p className="text-lg font-black" style={{ color: 'var(--fg)' }}>
              {isCompleted && campaign.failedCount === 0 ? 'All sent successfully!'
                : isCompleted ? 'Campaign completed'
                : isFailed ? 'Campaign failed'
                : 'Sending your campaign…'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3)' }}>
              {isSending
                ? `Processing recipient ${Math.min(campaign.nextIndex + 1, campaign.totalRecipients)} of ${campaign.totalRecipients}`
                : `${campaign.totalRecipients} recipient${campaign.totalRecipients !== 1 ? 's' : ''} targeted`}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-sm mt-2">
            <div className="w-full h-3 rounded-full overflow-hidden relative" style={{ background: 'var(--surface-2)' }}>
              <div
                className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
                style={{ width: `${Math.max(percent, campaign.sentCount + campaign.failedCount > 0 ? 4 : 0)}%`, background: isFailed ? 'var(--danger)' : 'var(--accent)' }}
              >
                {isSending && (
                  <span
                    className="absolute inset-0"
                    style={{
                      backgroundImage: 'linear-gradient(115deg, transparent 0%, rgba(255,255,255,0.35) 45%, rgba(255,255,255,0.35) 55%, transparent 100%)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 1.6s linear infinite',
                    }}
                  />
                )}
              </div>
            </div>
            <p className="text-[11px] font-semibold mt-1.5 tabular-nums" style={{ color: 'var(--fg-3)' }}>{percent}% complete</p>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
          <div className="flex flex-col items-center gap-1 py-4">
            <span className="flex items-center gap-1.5 text-2xl font-black tabular-nums" style={{ color: 'var(--accent)' }}>
              <CheckCircle2 size={16} strokeWidth={2.5} />{campaign.sentCount}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--fg-3)' }}>Sent</span>
          </div>
          <div className="flex flex-col items-center gap-1 py-4">
            <span className="flex items-center gap-1.5 text-2xl font-black tabular-nums" style={{ color: campaign.failedCount > 0 ? 'var(--danger)' : 'var(--fg-3)' }}>
              <XCircle size={16} strokeWidth={2.5} />{campaign.failedCount}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--fg-3)' }}>Failed</span>
          </div>
          <div className="flex flex-col items-center gap-1 py-4">
            <span className="flex items-center gap-1.5 text-2xl font-black tabular-nums" style={{ color: 'var(--fg)' }}>
              <Users size={16} strokeWidth={2.5} />{campaign.totalRecipients}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--fg-3)' }}>Total</span>
          </div>
        </div>
      </div>

      {isFailed && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl px-4 py-3.5 text-sm anim-fade-up"
          style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">This campaign failed to send.</p>
            {campaign.lastError && <p className="text-xs mt-1 opacity-80">{campaign.lastError}</p>}
          </div>
        </div>
      )}

      {campaign.isStuck && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-sm anim-fade-up"
          style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
          <span className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            No progress in the last few minutes — the send may have stalled.
          </span>
          <Button variant="secondary" size="sm" onClick={handleResume} loading={resuming} icon={<RefreshCw size={12} />}>
            Resume
          </Button>
        </div>
      )}

      {campaign.failedCount > 0 && campaign.recipients && (
        <div className="rounded-xl border border-border bg-white overflow-hidden mt-4 anim-fade-up s2">
          <div className="px-5 py-3.5 border-b border-border" style={{ background: 'var(--surface-2)' }}>
            <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--fg)' }}>
              <XCircle size={14} style={{ color: 'var(--danger)' }} />
              Failed recipients
            </h2>
          </div>
          <ul className="text-xs divide-y divide-border max-h-64 overflow-auto">
            {campaign.recipients.filter(r => r.sendStatus === 'failed').map((r) => (
              <li key={r.email} className="px-5 py-2.5">
                <span className="font-semibold" style={{ color: 'var(--fg)' }}>{r.email}</span>
                <p className="mt-0.5" style={{ color: 'var(--fg-3)' }}>{r.error}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
