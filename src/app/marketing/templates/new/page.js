import { requireMarketer } from '@/lib/dal'
import TemplateEditorClient from '../TemplateEditorClient'

export const metadata = { title: 'New Template — Go Fast Delivery Inc.' }

export default async function NewTemplatePage() {
  await requireMarketer()
  return <TemplateEditorClient mode="create" />
}
