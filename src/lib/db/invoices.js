import { ObjectId } from 'mongodb'
import { getDb } from './client.js'

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue']

export async function createInvoice(data) {
  const db = await getDb()
  const now = new Date()
  const doc = {
    companyName:    data.companyName    ?? '',
    companyAddress: data.companyAddress ?? '',
    companyCity:    data.companyCity    ?? '',
    companyPhone:   data.companyPhone   ?? '',
    companyEmail:   data.companyEmail   ?? '',
    invoiceNumber:  data.invoiceNumber  ?? '',
    invoiceDate:    data.invoiceDate    ? new Date(data.invoiceDate) : now,
    dueDate:        data.dueDate        ? new Date(data.dueDate)     : null,
    paymentTerms:   data.paymentTerms   ?? 'On Receipt',
    currency:       data.currency       ?? 'CAD',
    status:         INVOICE_STATUSES.includes(data.status) ? data.status : 'draft',
    clientName:     data.clientName     ?? '',
    clientAddress:  data.clientAddress  ?? '',
    clientCity:     data.clientCity     ?? '',
    clientPhone:    data.clientPhone    ?? '',
    clientEmail:    data.clientEmail    ?? '',
    items: Array.isArray(data.items) ? data.items.map(normalizeItem) : [],
    taxRate:        typeof data.taxRate === 'number' ? data.taxRate : 5,
    amountPaid:     typeof data.amountPaid === 'number' ? data.amountPaid : 0,
    notes: data.notes ?? '',
    createdAt: now,
    updatedAt: now,
  }
  const result = await db.collection('invoices').insertOne(doc)
  return { ...doc, _id: result.insertedId }
}

function normalizeItem(item) {
  return {
    description:  String(item.description  ?? '').trim().slice(0, 1000),
    serviceDate:  item.serviceDate ? String(item.serviceDate).trim().slice(0, 100) : '',
    rate:         typeof item.rate === 'number'     ? item.rate     : 0,
    quantity:     typeof item.quantity === 'number' ? item.quantity : 0,
    details:      String(item.details ?? '').trim().slice(0, 5000),
  }
}

export async function findAllInvoices({ search, status, limit = 20, skip = 0 } = {}) {
  const db = await getDb()
  const filter = buildFilter({ search, status })
  return db
    .collection('invoices')
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray()
}

export async function countAllInvoices({ search, status } = {}) {
  const db = await getDb()
  return db.collection('invoices').countDocuments(buildFilter({ search, status }))
}

function buildFilter({ search, status }) {
  const filter = {}
  if (status && INVOICE_STATUSES.includes(status)) filter.status = status
  if (search?.trim()) {
    const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [
      { invoiceNumber: re },
      { clientName:    re },
      { clientEmail:   re },
    ]
  }
  return filter
}

export async function findInvoiceById(id) {
  const db = await getDb()
  return db.collection('invoices').findOne({ _id: new ObjectId(id) })
}

export async function updateInvoice(id, data) {
  const db = await getDb()
  const now = new Date()
  const set = {
    companyName:    data.companyName    ?? '',
    companyAddress: data.companyAddress ?? '',
    companyCity:    data.companyCity    ?? '',
    companyPhone:   data.companyPhone   ?? '',
    companyEmail:   data.companyEmail   ?? '',
    invoiceNumber:  data.invoiceNumber  ?? '',
    invoiceDate:    data.invoiceDate    ? new Date(data.invoiceDate) : null,
    dueDate:        data.dueDate        ? new Date(data.dueDate)     : null,
    paymentTerms:   data.paymentTerms   ?? 'On Receipt',
    currency:       data.currency       ?? 'CAD',
    status:         INVOICE_STATUSES.includes(data.status) ? data.status : 'draft',
    clientName:     data.clientName     ?? '',
    clientAddress:  data.clientAddress  ?? '',
    clientCity:     data.clientCity     ?? '',
    clientPhone:    data.clientPhone    ?? '',
    clientEmail:    data.clientEmail    ?? '',
    items:          Array.isArray(data.items) ? data.items.map(normalizeItem) : [],
    taxRate:        typeof data.taxRate === 'number'     ? data.taxRate     : 5,
    amountPaid:     typeof data.amountPaid === 'number'  ? data.amountPaid  : 0,
    notes:          data.notes ?? '',
    updatedAt:      now,
  }
  return db.collection('invoices').updateOne(
    { _id: new ObjectId(id) },
    { $set: set }
  )
}

export async function deleteInvoice(id) {
  const db = await getDb()
  return db.collection('invoices').deleteOne({ _id: new ObjectId(id) })
}

// Shared pipeline stages to compute each invoice's total-with-tax from its items.
const INVOICE_TOTAL_STAGES = [
  {
    $addFields: {
      _subtotal: {
        $reduce: {
          input: { $ifNull: ['$items', []] },
          initialValue: 0,
          in: {
            $add: [
              '$$value',
              { $multiply: [{ $ifNull: ['$$this.rate', 0] }, { $ifNull: ['$$this.quantity', 0] }] },
            ],
          },
        },
      },
    },
  },
  {
    $addFields: {
      _withTax: {
        $add: [
          '$_subtotal',
          { $multiply: ['$_subtotal', { $divide: [{ $ifNull: ['$taxRate', 5] }, 100] }] },
        ],
      },
    },
  },
]

const REVENUE_GROUP_FIELDS = {
  total:   { $sum: '$_withTax' },
  revenue: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$_withTax', 0] } },
  count:   { $sum: 1 },
  paid:    { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
}

/**
 * Returns invoice stats for charts:
 *   byDay    — per-day counts/totals for the given year+month (for "Monthly" view)
 *   byMonth  — per-month counts/totals for the given year     (for "Yearly" view)
 *   byYear   — per-year totals for last 4 years
 *   statusBreakdown — all-time count per status
 */
export async function getInvoiceStats({ year, month } = {}) {
  const db = await getDb()
  const now         = new Date()
  const targetYear  = year  ?? now.getFullYear()
  const targetMonth = month ?? now.getMonth() + 1  // 1-12

  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate()

  // Per-day breakdown for the selected year+month
  const byDay = await db.collection('invoices').aggregate([
    {
      $match: {
        invoiceDate: {
          $gte: new Date(`${targetYear}-${String(targetMonth).padStart(2,'0')}-01`),
          $lt:  new Date(targetMonth === 12
            ? `${targetYear + 1}-01-01`
            : `${targetYear}-${String(targetMonth + 1).padStart(2,'0')}-01`),
        },
      },
    },
    ...INVOICE_TOTAL_STAGES,
    {
      $group: {
        _id: { $dayOfMonth: '$invoiceDate' },
        ...REVENUE_GROUP_FIELDS,
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray()

  // Per-month breakdown for the selected year
  const byMonth = await db.collection('invoices').aggregate([
    {
      $match: {
        invoiceDate: {
          $gte: new Date(`${targetYear}-01-01`),
          $lt:  new Date(`${targetYear + 1}-01-01`),
        },
      },
    },
    ...INVOICE_TOTAL_STAGES,
    {
      $group: {
        _id: { $month: '$invoiceDate' },
        ...REVENUE_GROUP_FIELDS,
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray()

  // Per-year totals for the last 4 years
  const currentYear = now.getFullYear()
  const byYear = await db.collection('invoices').aggregate([
    {
      $match: {
        invoiceDate: { $gte: new Date(`${currentYear - 3}-01-01`) },
      },
    },
    ...INVOICE_TOTAL_STAGES,
    {
      $group: {
        _id: { $year: '$invoiceDate' },
        ...REVENUE_GROUP_FIELDS,
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray()

  // All-time status breakdown
  const statusBreakdown = await db.collection('invoices').aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]).toArray()

  return { byDay, byMonth, byYear, statusBreakdown, year: targetYear, month: targetMonth, daysInMonth }
}

export async function getNextInvoiceNumber() {
  const db = await getDb()
  // invoiceNumber is a zero-padded string ("INV003"), so a Mongo-side
  // { invoiceNumber: -1 } sort is lexicographic, not numeric — it would pick
  // "INV999" over "INV1000" once numbers cross a digit-width boundary.
  // Numbers stay small (hundreds, not millions) and the field is indexed, so
  // fetching just the numeric suffix for every INV\d+ doc and taking the max
  // in JS is cheap and always correct regardless of digit width.
  const docs = await db.collection('invoices')
    .find({ invoiceNumber: /^INV\d+$/ }, { projection: { invoiceNumber: 1 } })
    .toArray()

  let next = 1
  for (const doc of docs) {
    const num = parseInt(doc.invoiceNumber.replace('INV', ''), 10)
    if (!isNaN(num) && num + 1 > next) next = num + 1
  }
  return `INV${String(next).padStart(3, '0')}`
}
