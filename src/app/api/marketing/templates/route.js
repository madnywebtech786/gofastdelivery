import { NextResponse } from 'next/server'
import { requireMarketer, handleApiError } from '@/lib/dal'
import { findTemplates, createTemplate } from '@/lib/db/emailTemplates'

export async function GET() {
  try {
    await requireMarketer()
    const templates = await findTemplates()
    return NextResponse.json(JSON.parse(JSON.stringify(templates)))
  } catch (err) {
    return handleApiError(err, '[GET /api/marketing/templates]')
  }
}

export async function POST(request) {
  try {
    const { userId } = await requireMarketer()
    const { name, design, html } = await request.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 })
    }
    if (!design || !html) {
      return NextResponse.json({ error: 'Template design and HTML are required' }, { status: 400 })
    }

    const template = await createTemplate({ name: name.trim(), design, html, createdBy: userId })
    return NextResponse.json({ template }, { status: 201 })
  } catch (err) {
    return handleApiError(err, '[POST /api/marketing/templates]')
  }
}
