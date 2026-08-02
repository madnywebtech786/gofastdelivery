import { NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/dal'
import { getDb } from '@/lib/db/client'
import { ObjectId } from 'mongodb'
import { CALGARY_TZ, calgaryDateKey, formatWeekdayShort } from '@/lib/dateFormat'

export async function GET() {
  try {
    const { userId } = await requireCustomer()
    const db = await getDb()
    const cid = new ObjectId(userId)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [
      total,
      pending,
      active,
      delivered,
      cancelled,
      recent7,
      totalSpend,
    ] = await Promise.all([
      db.collection('bookings').countDocuments({ customerId: cid }),
      db.collection('bookings').countDocuments({ customerId: cid, status: 'pending' }),
      db.collection('bookings').countDocuments({ customerId: cid, status: { $in: ['assigned_pickup', 'picked_up', 'assigned_delivery'] } }),
      db.collection('bookings').countDocuments({ customerId: cid, status: 'delivered' }),
      db.collection('bookings').countDocuments({ customerId: cid, status: 'cancelled' }),
      // Last 7 days per-day counts — grouped by Calgary calendar day, not UTC
      // (Mongo's $dateToString defaults to UTC unless a timezone is given).
      db.collection('bookings').aggregate([
        { $match: { customerId: cid, createdAt: { $gte: weekAgo } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: CALGARY_TZ },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).toArray(),
      // Total spend on delivered bookings
      db.collection('bookings').aggregate([
        { $match: { customerId: cid, status: 'delivered', estimatedPrice: { $ne: null } } },
        { $group: { _id: null, total: { $sum: '$estimatedPrice' } } },
      ]).toArray(),
    ])

    // Build 7-day chart — fill gaps with 0. Keyed by Calgary calendar day to
    // match the $dateToString timezone above.
    const chartData = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      const key = calgaryDateKey(d)
      const day = recent7.find((r) => r._id === key)
      chartData.push({
        date: key,
        label: formatWeekdayShort(d),
        count: day?.count ?? 0,
      })
    }

    return NextResponse.json({
      total,
      pending,
      active,
      delivered,
      cancelled,
      totalSpend: totalSpend[0]?.total ?? 0,
      chartData,
    })
  } catch (err) {
    console.error('[GET /api/customers/stats]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
