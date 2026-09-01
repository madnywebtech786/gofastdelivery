'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { calgaryDateKey } from '@/lib/dateFormat'
import { FileText, Plus, Trash2, Pencil, Eye, Send } from 'lucide-react'

export default function TemplatesClient({ templates, subscribedCount }) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState(null)

  async function handleDelete(template) {
    if (!confirm(`Delete template "${template.name}"? This cannot be undone.`)) return
    setDeletingId(template._id)
    try {
      await fetch(`/api/marketing/templates/${template._id}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6 anim-fade-up">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Templates</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--fg-3)' }}>
            {templates.length} template{templates.length !== 1 ? 's' : ''} · {subscribedCount} subscribed recipient{subscribedCount !== 1 ? 's' : ''}
          </p>
        </div>
        {/* Plain <a>, not next/link — the template editor route needs a
            fresh CSP header allowing Unlayer's script/iframe (see
            next.config.mjs), which only applies on a real document
            navigation, never on Next's client-side route transitions. */}
        <a href="/marketing/templates/new">
          <Button variant="primary" size="sm" icon={<Plus size={14} />}>New Template</Button>
        </a>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border border-border bg-white py-20 text-center">
          <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
            <FileText size={22} style={{ color: 'var(--fg-3)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>No email templates yet.</p>
          <a href="/marketing/templates/new" className="mt-3 inline-block text-sm font-semibold" style={{ color: 'var(--accent)' }}>
            Create your first template →
          </a>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white overflow-hidden anim-fade-up s1">
          <div className="hidden sm:block overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Template</th>
                  <th className="hidden md:table-cell">Last Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {templates.map((t, i) => (
                  <tr key={t._id} className={`anim-fade-up s${Math.min(i + 1, 6)}`}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                          <FileText size={14} />
                        </div>
                        <p className="font-semibold text-sm" style={{ color: 'var(--fg)' }}>{t.name}</p>
                      </div>
                    </td>
                    <td className="hidden md:table-cell">
                      <span className="text-xs" style={{ color: 'var(--fg-3)' }}>{calgaryDateKey(t.updatedAt)}</span>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <a
                        href={subscribedCount === 0 ? undefined : `/marketing/campaigns/new?templateId=${t._id}`}
                        aria-disabled={subscribedCount === 0}
                        className="inline-flex items-center gap-1 text-xs font-bold mr-4 transition-colors"
                        style={{ color: subscribedCount === 0 ? 'var(--fg-3)' : 'var(--accent)', cursor: subscribedCount === 0 ? 'not-allowed' : 'pointer' }}
                        title={subscribedCount === 0 ? 'No subscribed recipients yet' : undefined}
                        onClick={(e) => { if (subscribedCount === 0) e.preventDefault() }}
                      >
                        <Send size={12} /> Send
                      </a>
                      <a href={`/marketing/templates/${t._id}/preview`}
                        className="inline-flex items-center gap-1 text-xs font-semibold mr-4 transition-colors"
                        style={{ color: 'var(--fg-2)' }}
                        aria-label="Preview template">
                        <Eye size={13} />
                      </a>
                      <a href={`/marketing/templates/${t._id}/edit`}
                        className="inline-flex items-center gap-1 text-xs font-semibold mr-4 transition-colors"
                        style={{ color: 'var(--fg-2)' }}>
                        <Pencil size={12} /> Edit
                      </a>
                      <button
                        onClick={() => handleDelete(t)}
                        disabled={deletingId === t._id}
                        className="inline-flex items-center disabled:opacity-50"
                        style={{ color: 'var(--danger)' }}
                        aria-label="Delete template"
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
            {templates.map((t) => (
              <div key={t._id} className="flex items-center gap-3 px-4 py-3.5">
                <a href={`/marketing/templates/${t._id}/edit`} className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                    <FileText size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--fg)' }}>{t.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3)' }}>{calgaryDateKey(t.updatedAt)}</p>
                  </div>
                </a>
                <a href={`/marketing/templates/${t._id}/preview`}
                  className="p-1.5 shrink-0"
                  style={{ color: 'var(--fg-3)' }}
                  aria-label="Preview template">
                  <Eye size={16} />
                </a>
                <a
                  href={subscribedCount === 0 ? undefined : `/marketing/campaigns/new?templateId=${t._id}`}
                  className="p-1.5 shrink-0"
                  style={{ color: subscribedCount === 0 ? 'var(--fg-3)' : 'var(--accent)' }}
                  aria-label="Send campaign"
                  onClick={(e) => { if (subscribedCount === 0) e.preventDefault() }}
                >
                  <Send size={16} />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
