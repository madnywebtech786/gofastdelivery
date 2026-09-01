import { NextResponse } from 'next/server'
import { requireMarketer, handleApiError } from '@/lib/dal'
import { findUsersByRole } from '@/lib/db/users'
import { upsertSubscriber } from '@/lib/db/marketingSubscribers'

export async function POST() {
  try {
    await requireMarketer()
    const customers = await findUsersByRole('customer')

    let synced = 0
    for (const customer of customers) {
      if (!customer.email) continue
      const nameParts = (customer.name ?? '').trim().split(/\s+/).filter(Boolean)
      await upsertSubscriber({
        email: customer.email,
        firstName: nameParts[0] ?? null,
        lastName: nameParts.slice(1).join(' ') || null,
        source: 'customer',
        customerId: customer._id,
      })
      synced++
    }

    return NextResponse.json({ synced, total: customers.length })
  } catch (err) {
    return handleApiError(err, '[POST /api/marketing/subscribers/sync-customers]')
  }
}
