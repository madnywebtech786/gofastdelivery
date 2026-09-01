import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { requireMarketer, handleApiError } from '@/lib/dal'
import { parseSubscriberWorkbook } from '@/lib/excelImport'
import { upsertSubscriber } from '@/lib/db/marketingSubscribers'

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB — generous for a spreadsheet, guards against abuse

export async function POST(request) {
  try {
    await requireMarketer()

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File is too large (max 10MB)' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { valid, errors, totalRows } = await parseSubscriberWorkbook(buffer, file.name)

    const importBatchId = new ObjectId()
    let imported = 0
    for (const row of valid) {
      await upsertSubscriber({ ...row, source: 'import', importBatchId })
      imported++
    }

    return NextResponse.json({ totalRows, imported, skipped: errors.length, errors: errors.slice(0, 50) })
  } catch (err) {
    return handleApiError(err, '[POST /api/marketing/subscribers/import]')
  }
}
