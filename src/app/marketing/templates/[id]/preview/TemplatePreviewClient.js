'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'
import Button from '@/components/ui/Button'
import { fillSampleMergeTags } from '@/lib/mergeTags'

export default function TemplatePreviewClient({ name, html, templateId }) {
  const router = useRouter()
  const [showSampleData, setShowSampleData] = useState(true)

  const renderedHtml = useMemo(
    () => (showSampleData ? fillSampleMergeTags(html) : html),
    [html, showSampleData]
  )

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 3rem)' }}>
      <div className="flex items-center gap-3 mb-4 anim-fade-up">
        <button onClick={() => router.push('/marketing/templates')}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--fg-3)' }}>
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-lg font-bold flex-1" style={{ color: 'var(--fg)' }}>{name}</h1>

        <label className="flex items-center gap-2 text-xs font-medium mr-2" style={{ color: 'var(--fg-2)' }}>
          <input
            type="checkbox"
            checked={showSampleData}
            onChange={(e) => setShowSampleData(e.target.checked)}
          />
          Show sample merge tag data
        </label>

        <a href={`/marketing/templates/${templateId}/edit`}>
          <Button variant="secondary" size="sm" icon={<Pencil size={13} />}>Edit</Button>
        </a>
      </div>

      <div className="flex-1 rounded-xl border border-border overflow-hidden anim-fade-up s1" style={{ background: 'var(--surface-2)' }}>
        <iframe
          title={`Preview of ${name}`}
          srcDoc={renderedHtml}
          sandbox=""
          className="w-full h-full"
          style={{ border: 'none', background: '#fff' }}
        />
      </div>
    </div>
  )
}
