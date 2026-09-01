import { NextResponse } from 'next/server'
import { requireMarketer, handleApiError } from '@/lib/dal'
import { uploadMarketingImage } from '@/lib/s3'

/**
 * Backs the Unlayer editor's registerCallback('image', ...) hook
 * (src/components/marketing/TemplateEditor.js) — the browser posts the raw
 * file here BEFORE Unlayer ever uploads it anywhere itself, so the image
 * never touches Unlayer's own asset servers, only this bucket.
 */
export async function POST(request) {
  try {
    await requireMarketer()

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const url = await uploadMarketingImage(buffer, file.type)

    return NextResponse.json({ url })
  } catch (err) {
    return handleApiError(err, '[POST /api/marketing/templates/upload-image]')
  }
}
