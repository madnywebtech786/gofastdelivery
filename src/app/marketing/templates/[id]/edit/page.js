import { notFound } from 'next/navigation'
import { requireMarketer } from '@/lib/dal'
import { findTemplateById } from '@/lib/db/emailTemplates'
import TemplateEditorClient from '../../TemplateEditorClient'

export const metadata = { title: 'Edit Template — Go Fast Delivery Inc.' }

export default async function EditTemplatePage({ params }) {
  await requireMarketer()
  const { id } = await params
  const template = await findTemplateById(id)
  if (!template) notFound()

  return (
    <TemplateEditorClient
      mode="edit"
      templateId={id}
      initialName={template.name}
      initialDesign={JSON.parse(JSON.stringify(template.design))}
    />
  )
}
