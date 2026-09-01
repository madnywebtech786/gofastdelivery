'use client'

import { useState, useTransition, useCallback, useEffect, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import {
  Users, Mail, Search, X, ChevronLeft, ChevronRight, Loader2,
  UserPlus, RefreshCw, Upload, Trash2, AlertCircle, CheckCircle2,
} from 'lucide-react'

const PAGE_SIZE = 25

function Pagination({ page, total, pageSize, onNavigate }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border"
      style={{ background: 'var(--surface-2)' }}>
      <span className="text-xs" style={{ color: 'var(--fg-3)' }}>{start}–{end} of {total}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onNavigate(page - 1)} disabled={page === 1}
          className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: 'var(--fg-2)' }}>
          <ChevronLeft size={13} />
        </button>
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + Math.max(1, page - 3))
          .filter(p => p <= totalPages)
          .map(p => (
            <button key={p} onClick={() => onNavigate(p)}
              className="w-7 h-7 rounded-lg text-xs font-semibold transition-all"
              style={{ background: page === p ? 'var(--accent)' : 'transparent', color: page === p ? '#fff' : 'var(--fg-2)' }}>
              {p}
            </button>
          ))}
        <button onClick={() => onNavigate(page + 1)} disabled={page === totalPages}
          className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: 'var(--fg-2)' }}>
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const subscribed = status === 'subscribed'
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full shrink-0"
      style={{
        background: subscribed ? 'rgba(34,197,94,0.1)' : 'var(--surface-2)',
        color: subscribed ? '#16a34a' : 'var(--fg-3)',
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: subscribed ? '#22c55e' : 'var(--fg-3)' }} />
      {subscribed ? 'Subscribed' : 'Unsubscribed'}
    </span>
  )
}

function SourceBadge({ source }) {
  const labels = { customer: 'Customer', import: 'Imported', manual: 'Manual' }
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
      style={{ background: 'var(--surface-2)', color: 'var(--fg-3)' }}>
      {labels[source] ?? source}
    </span>
  )
}

export default function SubscribersClient({ subscribers, total, page, search: initialSearch, status: initialStatus }) {
  const router     = useRouter()
  const pathname   = usePathname()
  const params     = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(initialSearch)
  const debounceRef = useRef(null)

  const [addOpen, setAddOpen]         = useState(false)
  const [addForm, setAddForm]         = useState({ email: '', firstName: '', lastName: '' })
  const [addError, setAddError]       = useState('')
  const [addLoading, setAddLoading]   = useState(false)

  const [syncing, setSyncing]         = useState(false)
  const [syncResult, setSyncResult]   = useState(null)

  const [importOpen, setImportOpen]   = useState(false)
  const [importFile, setImportFile]   = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult]   = useState(null)
  const [importError, setImportError]     = useState('')
  const fileInputRef = useRef(null)

  const [deletingId, setDeletingId]   = useState(null)
  const [togglingId, setTogglingId]   = useState(null)

  const navigate = useCallback((overrides) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null || v === '' || (v === 1 && k === 'page')) next.delete(k)
      else next.set(k, String(v))
    }
    startTransition(() => router.push(`${pathname}?${next.toString()}`))
  }, [params, pathname, router])

  useEffect(() => {
    if (searchInput.trim() === (initialSearch ?? '').trim()) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      navigate({ search: searchInput.trim(), page: 1 })
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [searchInput]) // eslint-disable-line react-hooks/exhaustive-deps

  function clearSearch() {
    clearTimeout(debounceRef.current)
    setSearchInput('')
    navigate({ search: '', page: 1 })
  }

  async function handleAddSubmit(e) {
    e.preventDefault()
    setAddError('')
    setAddLoading(true)
    try {
      const res  = await fetch('/api/marketing/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error || 'Failed to add subscriber.'); return }
      setAddOpen(false)
      setAddForm({ email: '', firstName: '', lastName: '' })
      router.refresh()
    } catch { setAddError('Network error. Please try again.') }
    finally { setAddLoading(false) }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res  = await fetch('/api/marketing/subscribers/sync-customers', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncResult({ ok: true, message: `Synced ${data.synced} of ${data.total} customers.` })
        router.refresh()
      } else {
        setSyncResult({ ok: false, message: data.error || 'Sync failed.' })
      }
    } catch {
      setSyncResult({ ok: false, message: 'Network error during sync.' })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncResult(null), 5000)
    }
  }

  async function handleImportSubmit(e) {
    e.preventDefault()
    if (!importFile) return
    setImportError('')
    setImportLoading(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      const res  = await fetch('/api/marketing/subscribers/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setImportError(data.error || 'Import failed.'); return }
      setImportResult(data)
      setImportFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      router.refresh()
    } catch { setImportError('Network error during import.') }
    finally { setImportLoading(false) }
  }

  async function handleToggleStatus(subscriber) {
    setTogglingId(subscriber._id)
    const nextStatus = subscriber.status === 'subscribed' ? 'unsubscribed' : 'subscribed'
    try {
      await fetch(`/api/marketing/subscribers/${subscriber._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      router.refresh()
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(subscriber) {
    if (!confirm(`Remove ${subscriber.email} from the subscriber list?`)) return
    setDeletingId(subscriber._id)
    try {
      await fetch(`/api/marketing/subscribers/${subscriber._id}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  const currentPage = Math.max(1, page)

  return (
    <div>
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3 anim-fade-up">
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Subscribers</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--fg-3)' }}>
            {total} subscriber{total !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />}
            onClick={handleSync} disabled={syncing}>
            Sync Customers
          </Button>
          <Button variant="secondary" size="sm" icon={<Upload size={13} />} onClick={() => setImportOpen(true)}>
            Import Excel
          </Button>
          <Button variant="primary" size="sm" icon={<UserPlus size={13} />} onClick={() => setAddOpen(true)}>
            Add Subscriber
          </Button>
        </div>
      </div>

      {syncResult && (
        <div className="mb-4 flex items-center gap-2 rounded-xl px-3.5 py-3 text-xs font-semibold anim-fade-up"
          style={{
            background: syncResult.ok ? 'var(--success-bg)' : 'var(--danger-bg)',
            color: syncResult.ok ? 'var(--success)' : 'var(--danger)',
          }}>
          {syncResult.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {syncResult.message}
        </div>
      )}

      <div className="mb-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            {isPending
              ? <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
              : <Search size={14} style={{ color: 'var(--fg-3)' }} />
            }
          </div>
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search email or name…"
            className="pl-8 pr-8 py-2 rounded-xl border text-sm w-full focus:outline-none focus:ring-2 transition-all"
            style={{
              borderColor: isPending ? 'var(--accent)' : 'var(--border-2)',
              background: '#fff',
              color: 'var(--fg)',
            }}
          />
          {searchInput && !isPending && (
            <button type="button" onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center"
              style={{ color: 'var(--fg-3)' }}>
              <X size={13} />
            </button>
          )}
        </div>

        <Select
          value={initialStatus}
          onChange={(v) => navigate({ status: v, page: 1 })}
          placeholder="All statuses"
          className="w-44"
          options={[
            { value: '', label: 'All statuses' },
            { value: 'subscribed', label: 'Subscribed' },
            { value: 'unsubscribed', label: 'Unsubscribed' },
          ]}
        />
      </div>

      <div style={{ opacity: isPending ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        {subscribers.length === 0 ? (
          <div className="rounded-xl border border-border bg-white py-20 text-center anim-fade-up s1">
            <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
              <Users size={22} style={{ color: 'var(--fg-3)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>
              {initialSearch ? `No subscribers match "${initialSearch}".` : 'No subscribers yet.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-white overflow-hidden anim-fade-up s1">
            <div className="hidden sm:block overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Subscriber</th>
                    <th>Status</th>
                    <th className="hidden md:table-cell">Source</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map((s, i) => (
                    <tr key={s._id} className={`anim-fade-up s${Math.min(i + 1, 6)}`}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                            {(s.firstName || s.email).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-sm" style={{ color: 'var(--fg)' }}>
                              {[s.firstName, s.lastName].filter(Boolean).join(' ') || '—'}
                            </p>
                            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--fg-3)' }}>
                              <Mail size={10} />{s.email}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td><StatusBadge status={s.status} /></td>
                      <td className="hidden md:table-cell"><SourceBadge source={s.source} /></td>
                      <td className="text-right whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(s)}
                          disabled={togglingId === s._id}
                          className="text-xs font-semibold mr-3 transition-colors disabled:opacity-50"
                          style={{ color: 'var(--accent)' }}
                        >
                          {togglingId === s._id ? '…' : s.status === 'subscribed' ? 'Unsubscribe' : 'Resubscribe'}
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          disabled={deletingId === s._id}
                          className="inline-flex items-center disabled:opacity-50"
                          style={{ color: 'var(--danger)' }}
                          aria-label="Delete subscriber"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden divide-y divide-border">
              {subscribers.map((s) => (
                <div key={s._id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0"
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
                </div>
              ))}
            </div>

            <Pagination page={currentPage} total={total} pageSize={PAGE_SIZE}
              onNavigate={p => navigate({ page: p })} />
          </div>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Subscriber" size="sm">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <Input label="Email" type="email" required value={addForm.email}
            onChange={(e) => setAddForm(p => ({ ...p, email: e.target.value }))} placeholder="jane@example.com" />
          <Input label="First Name" type="text" value={addForm.firstName}
            onChange={(e) => setAddForm(p => ({ ...p, firstName: e.target.value }))} placeholder="Jane" />
          <Input label="Last Name" type="text" value={addForm.lastName}
            onChange={(e) => setAddForm(p => ({ ...p, lastName: e.target.value }))} placeholder="Doe" />
          {addError && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
              style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
              <AlertCircle size={12} className="mt-0.5 shrink-0" />{addError}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <Button type="submit" loading={addLoading} variant="primary">Add Subscriber</Button>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      <Modal open={importOpen} onClose={() => { setImportOpen(false); setImportResult(null); setImportError('') }} title="Import from Excel" size="md">
        <form onSubmit={handleImportSubmit} className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--fg-2)' }}>
            Upload an Excel or CSV file with columns <strong>email</strong>, <strong>first_name</strong>, <strong>last_name</strong>.
            Re-importing the same file never creates duplicates.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          {importError && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
              style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
              <AlertCircle size={12} className="mt-0.5 shrink-0" />{importError}
            </div>
          )}
          {importResult && (
            <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>
                Imported {importResult.imported} of {importResult.totalRows} rows. {importResult.skipped} skipped.
              </p>
              {importResult.errors?.length > 0 && (
                <ul className="text-xs space-y-1 max-h-40 overflow-auto" style={{ color: 'var(--fg-3)' }}>
                  {importResult.errors.map((e, i) => (
                    <li key={i}>Row {e.row}: {e.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <Button type="submit" loading={importLoading} variant="primary" disabled={!importFile}>Upload & Import</Button>
            <Button type="button" variant="secondary" onClick={() => { setImportOpen(false); setImportResult(null); setImportError('') }}>Close</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
