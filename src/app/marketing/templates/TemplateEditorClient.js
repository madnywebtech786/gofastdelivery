'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import TemplateEditor from '@/components/marketing/TemplateEditor'
import { ArrowLeft, AlertCircle, CheckCircle2, Copy, Check } from 'lucide-react'

// Kept in sync with the mergeTags option passed into Unlayer
// (src/components/marketing/TemplateEditor.js) and the actual fill logic
// at send time (src/lib/mergeTags.js) — this is what tells a marketer these
// tokens exist and what they do, since Unlayer's own merge-tag picker
// (usually inside its text-block toolbar) isn't an obvious thing to find on
// your own the first time.
const MERGE_TAG_REFERENCE = [
  { token: '{{first_name}}', description: "Recipient's first name" },
  { token: '{{last_name}}',  description: "Recipient's last name" },
  { token: '{{email}}',      description: "Recipient's email address" },
]

function MergeTagChip({ token }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can be unavailable (non-HTTPS, permission denied) —
      // the token is still visible to type manually, so this fails silently
      // rather than surfacing an error for a convenience feature.
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-colors"
      style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
      title={`Click to copy ${token}`}
    >
      {token}
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  )
}

export default function TemplateEditorClient({ mode, templateId, initialName = '', initialDesign = null }) {
  const router = useRouter()
  const editorRef = useRef(null)
  const [name, setName]         = useState(initialName)
  const [ready, setReady]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [saved, setSaved]       = useState(false)

  function handleReady() {
    setReady(true)
    if (initialDesign) {
      editorRef.current.editor.loadDesign(initialDesign)
    }
  }

  // Unlayer's saveDesign/exportHtml are callback-based, not promise-based —
  // wrapped here so the save handler can just await both.
  function saveDesign() {
    return new Promise((resolve) => editorRef.current.editor.saveDesign((design) => resolve(design)))
  }
  function exportHtml() {
    return new Promise((resolve) => editorRef.current.editor.exportHtml((data) => resolve(data.html)))
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Template name is required')
      return
    }
    setError('')
    setSaving(true)
    setSaved(false)
    try {
      // design and html are always regenerated together here — saving one
      // without the other would let them drift, and a campaign send always
      // uses the stored html, so a stale html after a design-only save
      // would silently send outdated content.
      const [design, html] = await Promise.all([saveDesign(), exportHtml()])

      const url    = mode === 'create' ? '/api/marketing/templates' : `/api/marketing/templates/${templateId}`
      const method = mode === 'create' ? 'POST' : 'PATCH'
      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), design, html }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to save template.'); return }

      if (mode === 'create') {
        router.push(`/marketing/templates/${data.template._id}/edit`)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 anim-fade-up">
        <button onClick={() => router.push('/marketing/templates')}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--fg-3)' }}>
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            className="text-lg font-bold"
          />
        </div>
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={!ready}>
          Save Template
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl px-3.5 py-3 text-xs font-semibold"
          style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
          <AlertCircle size={13} className="shrink-0" />{error}
        </div>
      )}
      {saved && (
        <div className="mb-4 flex items-center gap-2 rounded-xl px-3.5 py-3 text-xs font-semibold"
          style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
          <CheckCircle2 size={13} className="shrink-0" />Template saved.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white px-3.5 py-2.5">
        <span className="text-xs font-semibold" style={{ color: 'var(--fg-3)' }}>
          Personalize with:
        </span>
        {MERGE_TAG_REFERENCE.map((tag) => (
          <MergeTagChip key={tag.token} token={tag.token} />
        ))}
        <span className="text-xs" style={{ color: 'var(--fg-3)' }}>
          — type or paste one anywhere in the email body; it's filled in per recipient when you send.
        </span>
      </div>

      <div className="rounded-xl border border-border overflow-hidden anim-fade-up s1">
        <TemplateEditor editorRef={editorRef} onReady={handleReady} />
      </div>
    </div>
  )
}
