import { notFound } from 'next/navigation'
import { requireMarketer } from '@/lib/dal'
import { findTemplateById } from '@/lib/db/emailTemplates'
import TemplatePreviewClient from './TemplatePreviewClient'

export const metadata = { title: 'Preview Template — Go Fast Delivery Inc.' }

export default async function TemplatePreviewPage({ params }) {
  await requireMarketer()
  const { id } = await params
  const template = await findTemplateById(id)
  if (!template) notFound()

  return <TemplatePreviewClient name={template.name} html={template.html} templateId={id} />
}
