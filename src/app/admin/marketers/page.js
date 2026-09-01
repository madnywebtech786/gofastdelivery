import Link from 'next/link'
import { requireAdmin } from '@/lib/dal'
import { findUsersByRole } from '@/lib/db/users'
import Button from '@/components/ui/Button'
import { UserPlus, Mail, Phone, ChevronRight } from 'lucide-react'

export const metadata = { title: 'Marketers — Go Fast Delivery Inc.' }

export default async function AdminMarketersPage() {
  await requireAdmin()
  const marketers = await findUsersByRole('email_marketer')

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6 anim-fade-up">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Marketers</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--fg-3)' }}>
            {marketers.length} marketer{marketers.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Link href="/admin/marketers/new">
          <Button variant="primary" size="sm" icon={<UserPlus size={14} />}>Add Marketer</Button>
        </Link>
      </div>

      {marketers.length === 0 ? (
        <div className="rounded-xl border border-border bg-white py-20 text-center">
          <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
            <Mail size={22} style={{ color: 'var(--fg-3)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>No email marketer accounts yet.</p>
          <Link href="/admin/marketers/new" className="mt-3 inline-block text-sm font-semibold" style={{ color: 'var(--accent)' }}>
            Add your first marketer →
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white overflow-hidden anim-fade-up s1">
          <div className="hidden sm:block overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Marketer</th>
                  <th className="hidden md:table-cell">Phone</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {marketers.map((m, i) => (
                  <tr key={m._id.toString()} className={`anim-fade-up s${Math.min(i + 1, 6)}`}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm" style={{ color: 'var(--fg)' }}>{m.name}</p>
                          <p className="text-xs" style={{ color: 'var(--fg-3)' }}>{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell">
                      <span className="flex items-center gap-1.5 text-xs mono" style={{ color: 'var(--fg-2)' }}>
                        <Phone size={11} style={{ color: 'var(--fg-3)' }} />
                        {m.phone ?? '—'}
                      </span>
                    </td>
                    <td className="text-right">
                      <ChevronRight size={12} style={{ color: 'var(--fg-3)' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden divide-y divide-border">
            {marketers.map((m) => (
              <div key={m._id.toString()} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--fg)' }}>{m.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3)' }}>{m.phone ?? m.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
