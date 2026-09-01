'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import {
  Search, X, ChevronLeft, ChevronRight, Loader2, ArrowLeft, Send, AlertCircle, Check, FileText,
} from 'lucide-react'

const PAGE_SIZE = 25

function StatusBadge({ status }) {
  const subscribed = status === 'subscribed'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full shrink-0"
      style={{
        background: subscribed ? 'rgba(34,197,94,0.1)' : 'var(--surface-2)',
        color: subscribed ? '#16a34a' : 'var(--fg-3)',
      }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: subscribed ? '#22c55e' : 'var(--fg-3)' }} />
      {subscribed ? 'Subscribed' : 'Unsubscribed'}
    </span>
  )
}

export default function NewCampaignClient({ template: initialTemplate, templates, initialSubscribers, initialTotal, pageSize = PAGE_SIZE }) {
  const router = useRouter()

  // No template passed in from the server means we start on the
  // template-picker step (reached via the Campaigns page's "New Campaign"
  // button, which doesn't know a template up front) — otherwise skip
  // straight to recipient selection, same as the old templateId-in-URL flow.
  const [template, setTemplate] = useState(initialTemplate)
  const [step, setStep] = useState(initialTemplate ? 'select' : 'template')
  const [subject, setSubject] = useState('')
  const [sendError, setSendError] = useState('')
  const [sending, setSending] = useState(false)

  const [subscribers, setSubscribers] = useState(initialSubscribers ?? [])
  const [total, setTotal] = useState(initialTotal ?? 0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState('')
  const debounceRef = useRef(null)

  // Selection state: 'include' means `exceptions` IS the selected set.
  // 'exclude' means "everyone matching the current filter" IS selected,
  // MINUS whatever's in `exceptions` (individually unchecked after
  // clicking select-all). This is what lets select-all cover subscribers
  // across pages the browser has never actually fetched.
  const [selectionMode, setSelectionMode] = useState('include')
  const [exceptions, setExceptions] = useState(new Set())

  async function handleChooseTemplate(chosen) {
    setTemplate(chosen)
    setStep('select')
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: '1', search: '', status: '' })
      const res = await fetch(`/api/marketing/subscribers?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSubscribers(data.subscribers)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchSubscribers = useCallback(async (nextPage, nextSearch, nextStatus) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(nextPage), search: nextSearch, status: nextStatus })
      const res = await fetch(`/api/marketing/subscribers?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSubscribers(data.subscribers)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Any filter change invalidates the current selection — "select all
  // matching X" no longer means the same thing once the filter changes,
  // and carrying stale exceptions across an unrelated filter would make
  // the displayed selected-count lie.
  function resetSelection() {
    setSelectionMode('include')
    setExceptions(new Set())
  }

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      resetSelection()
      fetchSubscribers(1, searchInput.trim(), status)
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [searchInput, status]) // eslint-disable-line react-hooks/exhaustive-deps

  function goToPage(p) {
    setPage(p)
    fetchSubscribers(p, searchInput.trim(), status)
  }

  function toggleRow(id) {
    setExceptions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllMatching() {
    if (selectionMode === 'exclude') {
      resetSelection()
    } else {
      setSelectionMode('exclude')
      setExceptions(new Set())
    }
  }

  function isRowSelected(id) {
    return selectionMode === 'include' ? exceptions.has(id) : !exceptions.has(id)
  }

  // Only an estimate when in 'exclude' mode without every matching row
  // loaded — exact count of eligible ("subscribed") recipients is only
  // known for certain server-side at send time, this is what's shown in
  // the UI to give the marketer a clear sense of scale before confirming.
  const selectedCount = useMemo(() => {
    if (selectionMode === 'include') return exceptions.size
    return Math.max(0, total - exceptions.size)
  }, [selectionMode, exceptions, total])

  const currentPageAllSelected = subscribers.length > 0 && subscribers.every((s) => isRowSelected(s._id))

  function toggleCurrentPage() {
    if (currentPageAllSelected) {
      // Deselect everyone currently visible
      if (selectionMode === 'include') {
        setExceptions((prev) => {
          const next = new Set(prev)
          subscribers.forEach((s) => next.delete(s._id))
          return next
        })
      } else {
        setExceptions((prev) => {
          const next = new Set(prev)
          subscribers.forEach((s) => next.add(s._id))
          return next
        })
      }
    } else {
      // Select everyone currently visible
      if (selectionMode === 'include') {
        setExceptions((prev) => {
          const next = new Set(prev)
          subscribers.forEach((s) => next.add(s._id))
          return next
        })
      } else {
        setExceptions((prev) => {
          const next = new Set(prev)
          subscribers.forEach((s) => next.delete(s._id))
          return next
        })
      }
    }
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!subject.trim()) {
      setSendError('Subject line is required')
      return
    }
    setSendError('')
    setSending(true)
    try {
      const res = await fetch('/api/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template._id,
          subject: subject.trim(),
          selection: {
            mode: selectionMode,
            ids: Array.from(exceptions),
            search: searchInput.trim(),
            status,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSendError(data.error || 'Failed to start campaign.'); return }
      router.push(`/marketing/campaigns/${data.campaignId}`)
    } catch {
      setSendError('Network error. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  const STEP_LABELS = { template: 'Step 1 of 3 — Choose a template', select: 'Step 2 of 3 — Choose recipients', confirm: 'Step 3 of 3 — Subject and confirm' }

  function handleBack() {
    if (step === 'select' && !initialTemplate) { setStep('template'); return }
    if (step === 'confirm') { setStep('select'); return }
    router.push('/marketing/campaigns')
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 anim-fade-up">
        <button onClick={handleBack}
          className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--fg-3)' }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--fg)' }}>
            {template ? <>Send &ldquo;{template.name}&rdquo;</> : 'New Campaign'}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--fg-3)' }}>{STEP_LABELS[step]}</p>
        </div>
      </div>

      {step === 'template' && (
        <div className="rounded-xl border border-border bg-white overflow-hidden anim-fade-up s1">
          {(!templates || templates.length === 0) ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
                <FileText size={22} style={{ color: 'var(--fg-3)' }} />
              </div>
              <p className="text-sm font-medium mb-3" style={{ color: 'var(--fg-2)' }}>No templates yet.</p>
              <a href="/marketing/templates/new" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                Create your first template →
              </a>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {templates.map((t) => (
                <button
                  key={t._id}
                  onClick={() => handleChooseTemplate({ _id: t._id, name: t.name })}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-(--surface-2)"
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                    <FileText size={16} />
                  </div>
                  <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--fg)' }}>{t.name}</span>
                  <ArrowLeft size={14} className="rotate-180 shrink-0" style={{ color: 'var(--fg-3)' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'select' && (
        <>
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-xs">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                {loading
                  ? <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
                  : <Search size={14} style={{ color: 'var(--fg-3)' }} />}
              </div>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search email or name…"
                className="pl-8 pr-8 py-2 rounded-xl border text-sm w-full focus:outline-none focus:ring-2 transition-all"
                style={{ borderColor: 'var(--border-2)', background: '#fff', color: 'var(--fg)' }}
              />
              {searchInput && (
                <button type="button" onClick={() => setSearchInput('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center" style={{ color: 'var(--fg-3)' }}>
                  <X size={13} />
                </button>
              )}
            </div>

            <Select
              value={status}
              onChange={setStatus}
              placeholder="All statuses"
              className="w-44"
              options={[
                { value: '', label: 'All statuses' },
                { value: 'subscribed', label: 'Subscribed' },
                { value: 'unsubscribed', label: 'Unsubscribed' },
              ]}
            />

            <div className="flex-1" />

            <div className="flex items-center px-3.5 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
              {selectedCount} selected
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white overflow-hidden anim-fade-up s1">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border" style={{ background: 'var(--surface-2)' }}>
              <input
                type="checkbox"
                checked={currentPageAllSelected}
                onChange={toggleCurrentPage}
                className="w-4 h-4"
              />
              <span className="text-xs" style={{ color: 'var(--fg-3)' }}>Select this page</span>
              <span style={{ color: 'var(--border-2)' }}>·</span>
              <button
                type="button"
                onClick={toggleSelectAllMatching}
                className="text-xs font-semibold"
                style={{ color: 'var(--accent)' }}
              >
                {selectionMode === 'exclude' ? 'Clear selection' : `Select all ${total} matching`}
              </button>
            </div>

            <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
              {subscribers.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm" style={{ color: 'var(--fg-3)' }}>No subscribers match this filter.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {subscribers.map((s) => (
                    <label key={s._id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-(--surface-2)">
                      <input
                        type="checkbox"
                        checked={isRowSelected(s._id)}
                        onChange={() => toggleRow(s._id)}
                        className="w-4 h-4 shrink-0"
                      />
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                        {(s.firstName || s.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--fg)' }}>
                          {[s.firstName, s.lastName].filter(Boolean).join(' ') || s.email}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--fg-3)' }}>{s.email}</p>
                      </div>
                      <StatusBadge status={s.status} />
                    </label>
                  ))}
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border" style={{ background: 'var(--surface-2)' }}>
                <span className="text-xs" style={{ color: 'var(--fg-3)' }}>Page {page} of {totalPages}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => goToPage(page - 1)} disabled={page === 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--fg-2)' }}>
                    <ChevronLeft size={13} />
                  </button>
                  <button onClick={() => goToPage(page + 1)} disabled={page === totalPages}
                    className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--fg-2)' }}>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end mt-5">
            <Button
              variant="primary"
              disabled={selectedCount === 0}
              onClick={() => setStep('confirm')}
              icon={<ArrowLeft size={13} className="rotate-180" />}
            >
              Next: Subject &amp; Confirm
            </Button>
          </div>
        </>
      )}

      {step === 'confirm' && (
        <form onSubmit={handleSend} className="max-w-lg anim-fade-up">
          <div className="rounded-xl border border-border bg-white p-5 space-y-4">
            <p className="text-sm" style={{ color: 'var(--fg-2)' }}>
              Sending to <strong>{selectedCount}</strong> recipient{selectedCount !== 1 ? 's' : ''}.
              Only currently subscribed recipients in your selection will actually receive it.
              This cannot be undone once started.
            </p>
            <Input
              label="Subject Line"
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Big news from Go Fast Delivery!"
            />
            {sendError && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
                <AlertCircle size={12} className="mt-0.5 shrink-0" />{sendError}
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <Button type="submit" variant="primary" loading={sending} icon={<Send size={13} />}>
                Send Now
              </Button>
              <Button type="button" variant="secondary" onClick={() => setStep('select')}>Back</Button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
