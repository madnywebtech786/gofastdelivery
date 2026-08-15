import { requireAdmin } from '@/lib/dal'
import { findAllInvoices, countAllInvoices, getInvoiceStats } from '@/lib/db/invoices'
import { calgaryYearMonth } from '@/lib/dateFormat'
import InvoicesClient from './InvoicesClient'

export const metadata = { title: 'Invoices — Go Fast Delivery Inc.' }

const PAGE_SIZE = 20

export default async function AdminInvoicesPage({ searchParams }) {
  await requireAdmin()
  const params  = await searchParams
  const page    = Math.max(1, parseInt(params.page ?? '1'))
  const search  = params.search ?? ''
  const status  = params.status ?? ''
  const nowInCalgary = calgaryYearMonth()
  const year    = params.year  ? parseInt(params.year)  : nowInCalgary.year
  const month   = params.month ? parseInt(params.month) : nowInCalgary.month
  const skip    = (page - 1) * PAGE_SIZE

  const [invoices, total, stats] = await Promise.all([
    findAllInvoices({ search, status, limit: PAGE_SIZE, skip }),
    countAllInvoices({ search, status }),
    getInvoiceStats({ year, month }),
  ])

  return (
    <InvoicesClient
      initialInvoices={JSON.parse(JSON.stringify(invoices))}
      total={total}
      currentPage={page}
      currentSearch={search}
      currentStatus={status}
      stats={JSON.parse(JSON.stringify(stats))}
    />
  )
}
