import { NextResponse } from 'next/server'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { findUserById, deleteCustomerAccount } from '@/lib/db/users'

/**
 * DELETE /api/customers/[customerId]
 *
 * Admin-only. Permanently deletes a customer account and everything tied to
 * it (their bookings, any marketing-subscriber record) — see
 * deleteCustomerAccount's own doc comment for exactly what's removed and why
 * invoices are untouched. Refuses with 409 if the customer has a booking in
 * a non-terminal status, so a driver mid-route can't have it vanish under
 * them; the admin needs to resolve that booking first.
 */
export async function DELETE(request, { params }) {
  try {
    const { customerId } = await params // async params — Next.js 16
    await requireAdmin()

    const customer = await findUserById(customerId)
    if (!customer || customer.role !== 'customer') {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const result = await deleteCustomerAccount(customerId)
    if (!result.deleted) {
      return NextResponse.json(
        {
          error: `This customer has ${result.activeCount} active booking${result.activeCount > 1 ? 's' : ''} in progress. Cancel or complete ${result.activeCount > 1 ? 'them' : 'it'} first, then delete the account.`,
          code: 'ACTIVE_BOOKINGS',
        },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return handleApiError(err, '[DELETE /api/customers/[customerId]]')
  }
}
