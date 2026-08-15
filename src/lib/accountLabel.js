// How a customer account is written wherever a booking is shown — admin
// lists, booking detail, the customer's own pages. Kept in one place so the
// admin and the customer never see the same account described two ways.
//
// Pure and client-safe: it formats an already-fetched `customerAccount`
// object (see attachCustomerAccounts in src/lib/db/bookings.js), it does not
// read the database.

/**
 * Display name for the account that placed a booking.
 *   guest booking (no account)      -> "Guest"
 *   account with a company name     -> the company name
 *   otherwise                       -> the person's name
 */
export function accountName(customerAccount) {
  if (!customerAccount) return 'Guest'
  return customerAccount.companyName?.trim() || customerAccount.name?.trim() || 'Unknown account'
}

/**
 * The account number, or null when there isn't one to show. Null covers two
 * real cases the UI must not confuse with each other — a guest booking (no
 * account at all) and an account created before account numbers existed —
 * so callers pair this with accountName() rather than showing it alone.
 */
export function accountNumber(customerAccount) {
  if (!customerAccount) return null
  return customerAccount.accountNumber || null
}

/**
 * One-line label: "Fred's Bakery (GFD-0042)", falling back to just the name
 * when no number exists, and to "Guest (no account)" for guest bookings.
 */
export function accountLabel(customerAccount) {
  if (!customerAccount) return 'Guest (no account)'
  const name = accountName(customerAccount)
  const num  = accountNumber(customerAccount)
  return num ? `${name} (${num})` : name
}
