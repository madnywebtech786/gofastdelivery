'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'

const TABS = [
  {
    href: '/home',
    label: 'Home',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    href: '/pickups',
    label: 'Stops',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" strokeWidth={active ? 2.5 : 2} />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    href: '/route',
    label: 'Navigate',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="10" r="3" fill={active ? 'currentColor' : 'none'} />
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      </svg>
    ),
  },
  {
    href: '/history',
    label: 'History',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" strokeWidth={active ? 2.5 : 2} />
      </svg>
    ),
  },
]

export default function DriverShell({ children }) {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
  }

  const isMapPage = pathname === '/route'

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
      {/* Top bar — hidden on fullscreen map */}
      {!isMapPage && (
        <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-bold text-sm text-gray-900 tracking-tight">CourierGo</span>
          </div>
          <button
            onClick={handleSignOut}
            className="text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full transition"
          >
            Sign out
          </button>
        </header>
      )}

      {/* Page content */}
      <main className={['flex-1 flex flex-col', isMapPage ? '' : 'pb-20'].join(' ')}>
        {children}
      </main>

      {/* Bottom tab bar — hidden on fullscreen map */}
      {!isMapPage && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 flex"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {TABS.map((tab) => {
            const active = pathname === tab.href || (tab.href === '/home' && pathname === '/')
            const isNavigate = tab.href === '/route'
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={[
                  'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors relative',
                  active ? 'text-blue-600' : 'text-gray-400',
                ].join(' ')}
              >
                {/* Navigate tab gets a prominent pill */}
                {isNavigate ? (
                  <div className={[
                    'w-12 h-12 rounded-2xl flex items-center justify-center -mt-5 shadow-lg transition-colors',
                    active ? 'bg-blue-600' : 'bg-blue-500',
                  ].join(' ')}>
                    <span className="text-white">{tab.icon(true)}</span>
                  </div>
                ) : (
                  tab.icon(active)
                )}
                <span className={[
                  'text-[10px] font-medium',
                  active ? 'text-blue-600' : 'text-gray-400',
                  isNavigate ? 'mt-0.5' : '',
                ].join(' ')}>
                  {tab.label}
                </span>
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}
