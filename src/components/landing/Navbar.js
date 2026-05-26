'use client'
import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Menu, X, Phone, Mail, MapPin } from 'lucide-react'
import { useSpring, animated } from '@react-spring/web'

const NAV_LINKS = [
  { label: 'Home',           href: '#home' },
  { label: 'About',          href: '#about' },
  { label: 'Services',       href: '#services' },
  { label: 'Process',        href: '#process' },
  { label: 'Areas',          href: '#areas' },
  { label: 'Reviews',        href: '#reviews' },
  { label: 'Contact',        href: '#contact' },
  { label: 'Get a Quote',    href: '#contact', highlight: true },
  { label: 'Track Delivery', href: '/login',   isLink: true },
]

const CITIES = [
  'Calgary', 'Airdrie', 'Cochrane', 'Okotoks', 'Chestermere', 'Strathmore',
  'High River', 'Crossfield', 'Carstairs', 'Didsbury', 'Innisfail', 'Olds',
  'Canmore', 'Banff', 'Langdon', 'De Winton', 'Bragg Creek', 'Black Diamond',
  'Turner Valley', 'Nanton', 'Claresholm', 'Beiseker', 'Irricana',
]

function CityMarquee({ reverse = false, dark = false }) {
  const items = [...CITIES, ...CITIES, ...CITIES]
  const dur = reverse ? '28s' : '22s'
  const accent = dark ? 'rgba(255,88,13,0.55)' : 'rgba(255,88,13,0.5)'
  const muted = dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.22)'
  const dot = dark ? 'rgba(255,88,13,0.25)' : 'rgba(255,88,13,0.18)'
  const bg = dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)'
  const border = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'

  return (
    <div
      className="overflow-hidden"
      style={{
        background: bg,
        backdropFilter: 'blur(8px)',
        borderTop: `1px solid ${border}`,
        borderBottom: `1px solid ${border}`,
      }}
    >
      <div
        className="flex whitespace-nowrap"
        style={{ animation: `marquee-scroll ${dur} linear infinite${reverse ? ' reverse' : ''}` }}
      >
        {[0, 1, 2].map(rep => (
          <div key={rep} className="flex items-center shrink-0">
            {items.map((city, i) => (
              <span key={`${rep}-${i}`} className="inline-flex items-center gap-3 px-5 py-2">
                <span
                  className="text-[9px] font-black tracking-[0.22em] uppercase"
                  style={{ color: i % 2 === 0 ? accent : muted }}
                >
                  {city}
                </span>
                <span style={{ color: dot, fontSize: '5px' }}>◆</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Navbar() {
  const [scrolled, setScrolled]     = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const navSpring = useSpring({
    backgroundColor: scrolled ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.95)',
    boxShadow: scrolled ? '0 2px 20px rgba(0,0,0,0.08)' : '0 0px 0px rgba(0,0,0,0)',
    config: { tension: 300, friction: 30 },
  })

  const drawerSpring = useSpring({
    transform: drawerOpen ? 'translateX(0%)' : 'translateX(100%)',
    config: { tension: 280, friction: 26 },
  })

  const overlaySpring = useSpring({
    opacity: drawerOpen ? 1 : 0,
    pointerEvents: drawerOpen ? 'auto' : 'none',
    config: { tension: 300, friction: 30 },
  })

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const handleNavClick = useCallback((e, href) => {
    e.preventDefault()
    const wasOpen = drawerOpen
    closeDrawer()
    const target = document.querySelector(href)
    if (target) {
      setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), wasOpen ? 350 : 0)
    }
  }, [drawerOpen, closeDrawer])

  return (
    <>
      {/* ── Fixed top wrapper: info bar + nav + marquee ── */}
      <div className="fixed top-0 left-0 right-0 z-50">

        {/* Info bar */}
        <div
          className="block"
          style={{ background: '#1bb908', borderBottom: '1px solid rgba(0,0,0,0.1)' }}
        >
          {/* Mobile: two rows. sm+: single row */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1 sm:py-0 flex flex-col sm:flex-row sm:h-7 sm:items-center sm:justify-between gap-0.5 sm:gap-4">
            {/* Row 1: phone + email justified between on mobile */}
            <div className="flex items-center justify-between sm:justify-start sm:gap-5">
              <a
                href="tel:+14035550199"
                className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold transition-colors"
                style={{ color: 'rgba(255,255,255,0.85)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.85)'}
              >
                <Phone size={9} strokeWidth={2.2} />
                +1 (403) 555-0199
              </a>
              <a
                href="mailto:hello@gofastdelivery.ca"
                className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold transition-colors"
                style={{ color: 'rgba(255,255,255,0.85)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.85)'}
              >
                <Mail size={9} strokeWidth={2.2} />
                hello@gofastdelivery.ca
              </a>
            </div>
            {/* Row 2 on mobile: address centered. Hidden on sm+ it moves to the right */}
            <div className="flex items-center justify-center sm:justify-end gap-1.5 text-[10px] sm:text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>
              <MapPin size={9} strokeWidth={2.2} style={{ color: 'rgba(255,255,255,0.9)' }} />
              Calgary, AB &amp; Surrounding Areas
            </div>
          </div>
        </div>

        {/* Top city marquee */}
        <CityMarquee reverse={false} dark={false} />

        {/* Main nav */}
        <animated.nav
          style={navSpring}
          className="backdrop-blur-md"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="shrink-0">
              <Image
                src="/images/logo.png"
                alt="GoFastDelivery"
                width={130}
                height={44}
                priority
                className="h-9 w-auto object-contain"
              />
            </Link>

            {/* Desktop nav links */}
            <ul className="hidden lg:flex items-center gap-4">
              {NAV_LINKS.map(link => {
                if (link.highlight) {
                  return (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        onClick={(e) => handleNavClick(e, link.href)}
                        className="text-[13px] font-semibold transition-colors duration-200"
                        style={{ color: 'var(--landing-text)' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-green)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--landing-text)'}
                      >
                        {link.label}
                      </a>
                    </li>
                  )
                }
                if (link.isLink) {
                  return (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-[13px] font-semibold transition-colors duration-200"
                        style={{ color: 'var(--landing-text)' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-orange)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--landing-text)'}
                      >
                        {link.label}
                      </Link>
                    </li>
                  )
                }
                return (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      onClick={(e) => handleNavClick(e, link.href)}
                      className="text-[13px] font-semibold transition-colors duration-200"
                      style={{ color: 'var(--landing-text)' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-orange)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--landing-text)'}
                    >
                      {link.label}
                    </a>
                  </li>
                )
              })}
            </ul>

            {/* Desktop CTAs */}
            <div className="hidden lg:flex items-center gap-2">
              <Link
                href="/login"
                className="px-3 py-1.5 text-[12px] font-bold rounded-lg border transition-colors duration-200"
                style={{ borderColor: 'var(--landing-border)', color: 'var(--landing-text)' }}
              >
                Login
              </Link>
              <Link
                href="/login"
                className="px-4 py-1.5 text-[12px] font-bold rounded-lg text-white transition-opacity hover:opacity-90 shadow-sm"
                style={{ background: 'var(--brand-green)' }}
              >
                Ship Now
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-2 rounded-lg transition-colors"
              style={{ color: 'var(--landing-text)' }}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </animated.nav>
      </div>

      {/* Spacer for fixed header height: info bar (32px) + marquee (~28px) + nav (56px) = ~116px */}
      <div className="h-29 hidden md:block" />
      <div className="h-22 md:hidden" />

      {/* Overlay */}
      <animated.div
        style={overlaySpring}
        onClick={closeDrawer}
        className="fixed inset-0 z-60 bg-black/50 lg:hidden"
      />

      {/* Mobile drawer */}
      <animated.div
        className="fixed top-0 right-0 z-70 w-screen h-screen lg:hidden flex flex-col overflow-hidden"
        style={{ ...drawerSpring, background: '#0d0d0d' }}
      >
        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,88,13,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,88,13,1) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Header */}
        <div className="relative flex items-center justify-between px-7 h-14 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="inline-flex rounded-lg overflow-hidden" style={{ background: 'white', padding: '3px 7px' }}>
            <Image
              src="/images/logo.png"
              alt="GoFastDelivery"
              width={100}
              height={32}
              className="h-7 w-auto object-contain"
            />
          </div>
          <button
            onClick={closeDrawer}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)' }}
            aria-label="Close menu"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Nav links */}
        <nav className="relative flex-1 flex flex-col justify-center px-7 gap-0 overflow-y-auto">
          {NAV_LINKS.filter(l => !l.highlight && !l.isLink).map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleNavClick(e, link.href)}
              className="group flex items-center gap-3 py-3 border-b"
              style={{ borderColor: 'rgba(255,255,255,0.05)' }}
            >
              <span
                className="text-[10px] font-black tabular-nums shrink-0 w-5"
                style={{ color: 'rgba(255,88,13,0.4)', fontFamily: 'monospace' }}
              >
                0{i + 1}
              </span>
              <span
                className="text-base font-black transition-colors duration-200"
                style={{ color: 'rgba(255,255,255,0.75)' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#ff580d' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
              >
                {link.label}
              </span>
              <span
                className="ml-auto opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-0 group-hover:translate-x-1"
                style={{ color: '#ff580d' }}
              >
                →
              </span>
            </a>
          ))}
        </nav>

        {/* Bottom CTAs */}
        <div className="relative px-7 pb-8 flex flex-col gap-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1.25rem' }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#1bb908', boxShadow: '0 0 6px #1bb908' }} />
            <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>
              2,500+ deliveries · 99.2% on-time · Calgary-based
            </span>
          </div>
          <Link
            href="/login"
            onClick={closeDrawer}
            className="w-full py-3 text-center text-sm font-black rounded-2xl text-white"
            style={{ background: 'linear-gradient(135deg, #1bb908, #15960a)', boxShadow: '0 4px 16px rgba(27,185,8,0.3)' }}
          >
            Ship Now
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/login"
              onClick={closeDrawer}
              className="py-2.5 text-center text-xs font-black rounded-xl transition-all"
              style={{ border: '1.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
            >
              Track Delivery
            </Link>
            <a
              href="#contact"
              onClick={(e) => handleNavClick(e, '#contact')}
              className="py-2.5 text-center text-xs font-black rounded-xl transition-all"
              style={{ border: '1.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
            >
              Get a Quote
            </a>
          </div>
          <Link
            href="/login"
            onClick={closeDrawer}
            className="w-full py-2.5 text-center text-xs font-black rounded-xl"
            style={{ border: '1.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
          >
            Login
          </Link>
        </div>
      </animated.div>

      {/* ── Bottom sticky city marquee ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <CityMarquee reverse={true} dark={false} />
      </div>
    </>
  )
}
