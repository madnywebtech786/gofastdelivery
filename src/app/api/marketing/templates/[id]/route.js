import { NextResponse } from 'next/server'
import { requireMarketer, handleApiError } from '@/lib/dal'
import { findTemplateById, updateTemplate, deleteTemplate } from '@/lib/db/emailTemplates'

export async function GET(request, { params }) {
  try {
    await requireMarketer()
    const { id } = await params
    const template = await findTemplateById(id)
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    return NextResponse.json(JSON.parse(JSON.stringify(template)))
  } catch (err) {
    return handleApiError(err, '[GET /api/marketing/templates/[id]]')
  }
}

export async function PATCH(request, { params }) {
  try {
    await requireMarketer()
    const { id } = await params
    const { name, design, html } = await request.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 })
    }
    if (!design || !html) {
      return NextResponse.json({ error: 'Template design and HTML are required' }, { status: 400 })
    }

    const template = await updateTemplate(id, { name: name.trim(), design, html })
    return NextResponse.json({ template })
  } catch (err) {
    return handleApiError(err, '[PATCH /api/marketing/templates/[id]]')
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireMarketer()
    const { id } = await params
    await deleteTemplate(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, '[DELETE /api/marketing/templates/[id]]')
  }
}
