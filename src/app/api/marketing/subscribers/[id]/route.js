import { NextResponse } from 'next/server'
import { requireMarketer, handleApiError } from '@/lib/dal'
import { setSubscriberStatus, deleteSubscriber } from '@/lib/db/marketingSubscribers'

export async function PATCH(request, { params }) {
  try {
    await requireMarketer()
    const { id } = await params
    const { status } = await request.json()
    if (!['subscribed', 'unsubscribed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    await setSubscriberStatus(id, status)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, '[PATCH /api/marketing/subscribers/[id]]')
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireMarketer()
    const { id } = await params
    await deleteSubscriber(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, '[DELETE /api/marketing/subscribers/[id]]')
  }
}
