'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Truck, LayoutDashboard, PackageOpen, Plus, LogOut,
  Menu, X, ChevronRight,
} from 'lucide-react'
import { useState } from 'react'

const NAV = [
  { href: '/overview',    label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/my-bookings', label: 'My Bookings',  icon: PackageOpen },
  { href: '/book',        label: 'New Booking',  icon: Plus },
]

export default function CustomerLayout({ children }) {
  const pathname    = usePathname()
  const router      = useRouter()
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
  }

  const SidebarContent = () => (
    <>
      {/* Brand */}
      <div className="px-5 py-5 flex items-center gap-3 border-b border-border">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent)', boxShadow: '0 2px 12px var(--accent-glow)' }}>
          <Truck size={15} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold leading-none" style={{ color: 'var(--fg)' }}>Go Fast Delivery</p>
          <p className="text-[10px] mt-0.5 font-medium" style={{ color: 'var(--fg-3)' }}>Customer Portal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/overview' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative"
              style={{
                color:      active ? 'var(--accent)' : 'var(--fg-2)',
                background: active ? 'var(--accent-dim)' : 'transparent',
                fontWeight: active ? 600 : 500,
              }}
            >
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                  style={{ background: 'var(--accent)' }} />
              )}
              <Icon size={16} style={{ flexShrink: 0 }} />
              {label}
              {active && <ChevronRight size={12} className="ml-auto" style={{ opacity: 0.6 }} />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-5">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full transition-all"
          style={{ color: 'var(--fg-3)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-bg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-3)'; e.currentTarget.style.background = 'transparent' }}
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>

      {/* ── Desktop Sidebar ──────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-white border-r border-border fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* ── Mobile overlay ───────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}
          style={{ background: 'rgba(15,17,23,0.4)', backdropFilter: 'blur(2px)' }} />
      )}

      {/* ── Mobile Sidebar ───────────────────────────────────────────── */}
      <aside
        className="fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-white border-r border-border lg:hidden transition-transform duration-300"
        style={{ transform: open ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <button
          className="absolute top-4 right-4 p-1.5 rounded-lg"
          style={{ color: 'var(--fg-3)' }}
          onClick={() => setOpen(false)}
        >
          <X size={18} />
        </button>
        <SidebarContent />
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:pl-56 min-w-0">

        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-border px-4 h-14 flex items-center justify-between shadow-sm">
          <button
            className="p-1.5 rounded-lg"
            style={{ color: 'var(--fg-3)' }}
            onClick={() => setOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--accent)' }}>
              <Truck size={12} className="text-white" />
            </div>
            <span className="text-sm font-bold" style={{ color: 'var(--fg)' }}>Go Fast Delivery</span>
          </div>
          <div className="w-8" /> {/* spacer */}
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  )
}
