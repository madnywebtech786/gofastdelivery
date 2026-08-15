import { NextResponse } from 'next/server'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { createInvoice, findAllInvoices, countAllInvoices, getNextInvoiceNumber, INVOICE_STATUSES } from '@/lib/db/invoices'

export async function GET(request) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') ?? ''
    const status = searchParams.get('status') ?? ''
    const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit  = 20
    const skip   = (page - 1) * limit

    const [invoices, total] = await Promise.all([
      findAllInvoices({ search, status, limit, skip }),
      countAllInvoices({ search, status }),
    ])

    return NextResponse.json({
      invoices: JSON.parse(JSON.stringify(invoices)),
      total,
      page,
      pageSize: limit,
    })
  } catch (err) {
    return handleApiError(err, '[GET /api/invoices]')
  }
}

export async function POST(request) {
  try {
    await requireAdmin()
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    if (!body.invoiceNumber?.trim()) {
      return NextResponse.json({ error: 'Invoice number is required' }, { status: 400 })
    }
    if (!body.clientName?.trim()) {
      return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
    }
    if (!body.clientEmail?.trim()) {
      return NextResponse.json({ error: 'Client email is required' }, { status: 400 })
    }
    // The number the client submitted was generated when the New Invoice page
    // loaded, so it goes stale the moment any other invoice is created — a
    // second tab, a second admin, or simply creating another invoice without
    // a full page reload all resubmit a number that now exists, and the unique
    // index rejects it. Rather than surfacing that as a dead end, take the
    // next free number and retry; the sequence is generated for the admin, not
    // chosen by them (the field is read-only on this form), so silently moving
    // to the next one is exactly what they'd do by hand anyway.
    const MAX_NUMBER_RETRIES = 5
    let attempt = 0
    for (;;) {
      try {
        const invoice = await createInvoice(body)
        return NextResponse.json(JSON.parse(JSON.stringify(invoice)), { status: 201 })
      } catch (err) {
        const isDuplicateNumber = err?.code === 11000 && /invoiceNumber/.test(err?.message ?? '')
        if (!isDuplicateNumber || attempt >= MAX_NUMBER_RETRIES) throw err
        attempt += 1
        body.invoiceNumber = await getNextInvoiceNumber()
      }
    }
  } catch (err) {
    if (err?.code === 11000) {
      return NextResponse.json({ error: 'Invoice number already exists. Please use a unique invoice number.' }, { status: 400 })
    }
    return handleApiError(err, '[POST /api/invoices]')
  }
}
