'use client'
import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { useSpring, animated } from '@react-spring/web'

const NAV_LINKS = [
  { label: 'Home',     href: '#home' },
  { label: 'About',    href: '#about' },
  { label: 'Services', href: '#services' },
  { label: 'Process',  href: '#process' },
  { label: 'Reviews',  href: '#reviews' },
  { label: 'Contact',  href: '#contact' },
]

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
    backgroundColor: scrolled ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.92)',
    boxShadow: scrolled
      ? '0 2px 20px rgba(0,0,0,0.08)'
      : '0 0px 0px rgba(0,0,0,0)',
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
      <animated.nav
        style={navSpring}
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/images/logo.png"
              alt="GoFastDelivery"
              width={140}
              height={48}
              priority
              className="h-10 w-auto object-contain"
            />
          </Link>

          {/* Desktop nav links */}
          <ul className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map(link => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  className="text-sm font-semibold transition-colors duration-200"
                  style={{ color: 'var(--landing-text)' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-orange)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--landing-text)'}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-bold rounded-lg border-2 transition-colors duration-200"
              style={{ borderColor: 'var(--brand-orange)', color: 'var(--brand-orange)' }}
            >
              Login
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-bold rounded-lg text-white transition-colors duration-200 shadow-sm"
              style={{ background: 'var(--brand-orange)' }}
            >
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden p-2 rounded-lg transition-colors"
            style={{ color: 'var(--landing-text)' }}
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
        </div>
      </animated.nav>

      {/* Overlay */}
      <animated.div
        style={overlaySpring}
        onClick={closeDrawer}
        className="fixed inset-0 z-[60] bg-black/50 md:hidden"
      />

      {/* Full-screen drawer (right to left) — dark themed */}
      <animated.div
        style={drawerSpring}
        className="fixed top-0 right-0 z-[70] w-screen h-screen md:hidden flex flex-col overflow-hidden"
        style={{ ...drawerSpring, background: '#0d0d0d' }}
      >
        {/* Brand accent line — left edge */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ background: 'linear-gradient(180deg, #ff580d, #1bb908)' }}
        />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,88,13,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,88,13,1) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Header */}
        <div className="relative flex items-center justify-between px-8 h-16 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="inline-flex rounded-lg overflow-hidden" style={{ background: 'white', padding: '4px 8px' }}>
            <Image
              src="/images/logo.png"
              alt="GoFastDelivery"
              width={110}
              height={36}
              className="h-8 w-auto object-contain"
            />
          </div>
          <button
            onClick={closeDrawer}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)' }}
            aria-label="Close menu"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Nav links — numbered, large */}
        <nav className="relative flex-1 flex flex-col justify-center px-8 gap-1">
          {NAV_LINKS.map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleNavClick(e, link.href)}
              className="group flex items-center gap-4 py-3.5 border-b transition-all duration-200"
              style={{ borderColor: 'rgba(255,255,255,0.05)' }}
            >
              {/* Number */}
              <span
                className="text-[11px] font-black tabular-nums shrink-0 w-6 transition-colors duration-200"
                style={{ color: 'rgba(255,88,13,0.45)', fontFamily: 'monospace' }}
              >
                0{i + 1}
              </span>
              {/* Label */}
              <span
                className="text-2xl font-black transition-colors duration-200"
                style={{ color: 'rgba(255,255,255,0.75)' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#ff580d' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
              >
                {link.label}
              </span>
              {/* Arrow on hover */}
              <span
                className="ml-auto opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-0 group-hover:translate-x-1"
                style={{ color: '#ff580d' }}
              >
                →
              </span>
            </a>
          ))}
        </nav>

        {/* Bottom — CTAs + social proof */}
        <div className="relative px-8 pb-10 flex flex-col gap-4 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1.5rem' }}>
          {/* Trust line */}
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#1bb908', boxShadow: '0 0 6px #1bb908' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>
              2,500+ deliveries · 99.2% on-time · Calgary-based
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <Link
              href="/login"
              onClick={closeDrawer}
              className="w-full py-3.5 text-center text-sm font-black rounded-2xl text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #ff580d, #e04500)', boxShadow: '0 4px 20px rgba(255,88,13,0.3)' }}
            >
              Get Started Free
            </Link>
            <Link
              href="/login"
              onClick={closeDrawer}
              className="w-full py-3.5 text-center text-sm font-black rounded-2xl transition-all hover:border-white/20"
              style={{ border: '1.5px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}
            >
              Login
            </Link>
          </div>
        </div>
      </animated.div>
    </>
  )
}
