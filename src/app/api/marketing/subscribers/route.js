import { NextResponse } from 'next/server'
import { requireMarketer, handleApiError } from '@/lib/dal'
import { upsertSubscriber, findSubscribers, countSubscribers } from '@/lib/db/marketingSubscribers'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAGE_SIZE = 25

// Used by the recipient picker (src/app/marketing/campaigns/new) to
// re-fetch as search/filter/page change without a full page reload. The
// main subscribers list page itself still fetches server-side via props —
// this is additive, not a replacement.
export async function GET(request) {
  try {
    await requireMarketer()
    const params = new URL(request.url).searchParams
    const page   = Math.max(1, parseInt(params.get('page') ?? '1'))
    const search = params.get('search') ?? ''
    const status = params.get('status') ?? ''
    const skip   = (page - 1) * PAGE_SIZE

    const [subscribers, total] = await Promise.all([
      findSubscribers({ search, status, limit: PAGE_SIZE, skip }),
      countSubscribers({ search, status }),
    ])
    return NextResponse.json({ subscribers: JSON.parse(JSON.stringify(subscribers)), total, page, pageSize: PAGE_SIZE })
  } catch (err) {
    return handleApiError(err, '[GET /api/marketing/subscribers]')
  }
}

export async function POST(request) {
  try {
    await requireMarketer()
    const { email, firstName, lastName } = await request.json()

    if (!email?.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (!EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const subscriber = await upsertSubscriber({
      email: email.trim(),
      firstName: firstName?.trim() || null,
      lastName: lastName?.trim() || null,
      source: 'manual',
    })
    return NextResponse.json({ subscriber }, { status: 201 })
  } catch (err) {
    return handleApiError(err, '[POST /api/marketing/subscribers]')
  }
}
