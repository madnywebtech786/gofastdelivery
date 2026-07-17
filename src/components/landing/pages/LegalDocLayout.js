'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/landing/Navbar'
import Footer from '@/components/landing/Footer'
import GradientHeading from '@/components/landing/GradientHeading'
import { useIntersectionObserver } from '@/components/landing/hooks/useIntersectionObserver'
import { ScrollText, ChevronDown, ArrowUp } from 'lucide-react'

/**
 * Shared chrome for legal/policy documents (Terms & Conditions, Privacy
 * Policy, etc.): sticky scroll-spy table of contents + numbered section
 * layout, matching the GoFastDelivery landing-page design system.
 *
 * `sections`: [{ id, num, title, body: [{ type: 'p', text } | { type: 'ul', items: [...] }] }]
 * A section's `body` entries render in order — paragraphs and bullet lists
 * can be mixed within one section (needed for the Privacy Policy content).
 */

// ─── Scroll-spy TOC ─────────────────────────────────────────────────────────────
function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0])

  useEffect(() => {
    function onScroll() {
      const offset = 140 // account for sticky navbar + breathing room
      let current = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        if (el.getBoundingClientRect().top - offset <= 0) current = id
      }
      setActive(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ids])

  return active
}

function scrollToSection(id) {
  const el = document.getElementById(id)
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY - 96
  window.scrollTo({ top, behavior: 'smooth' })
}

function DesktopTOC({ sections, activeId }) {
  return (
    <nav
      className="hidden lg:block sticky self-start"
      style={{ top: '6.5rem' }}
      aria-label="Table of contents"
    >
      <div
        className="rounded-3xl p-5"
        style={{ background: '#ffffff', border: '1px solid var(--landing-border)' }}
      >
        <p
          className="text-[10px] font-black tracking-[0.18em] uppercase mb-4 px-2"
          style={{ color: 'rgba(0,0,0,0.35)' }}
        >
          On This Page
        </p>
        <ul className="flex flex-col gap-0.5">
          {sections.map((s) => {
            const isActive = s.id === activeId
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-all"
                  style={{
                    background: isActive ? 'var(--brand-green-dim)' : 'transparent',
                  }}
                >
                  <span
                    className="text-[10px] font-black tabular-nums shrink-0 w-5"
                    style={{ color: isActive ? 'var(--brand-green)' : 'rgba(0,0,0,0.28)' }}
                  >
                    {s.num}
                  </span>
                  <span
                    className="text-[13px] font-semibold leading-snug"
                    style={{ color: isActive ? 'var(--brand-green)' : 'var(--landing-text-2)' }}
                  >
                    {s.title}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}

function MobileTOC({ sections, activeId }) {
  const [open, setOpen] = useState(false)
  const activeSection = sections.find((s) => s.id === activeId) ?? sections[0]

  return (
    <div className="lg:hidden sticky z-20" style={{ top: '4.25rem' }}>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#ffffff', border: '1px solid var(--landing-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
      >
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span
              className="text-[10px] font-black tabular-nums shrink-0"
              style={{ color: 'var(--brand-green)' }}
            >
              {activeSection.num}
            </span>
            <span className="text-sm font-bold truncate" style={{ color: 'var(--landing-text)' }}>
              {activeSection.title}
            </span>
          </span>
          <ChevronDown
            size={16}
            style={{ color: 'var(--landing-text-2)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}
          />
        </button>
        {open && (
          <ul
            className="flex flex-col gap-0.5 px-2 pb-2 overflow-y-auto"
            style={{ borderTop: '1px solid var(--landing-border)', maxHeight: '55vh' }}
          >
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => { scrollToSection(s.id); setOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
                  style={{ background: s.id === activeId ? 'var(--brand-green-dim)' : 'transparent' }}
                >
                  <span className="text-[10px] font-black tabular-nums w-5 shrink-0" style={{ color: 'var(--brand-green)' }}>{s.num}</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--landing-text)' }}>{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function SectionBody({ body }) {
  return (
    <div className="pl-0 sm:pl-[2.05rem] flex flex-col gap-3">
      {body.map((block, i) => {
        if (block.type === 'ul') {
          return (
            <ul key={i} className="flex flex-col gap-2 my-1">
              {block.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2.5 text-[15px] leading-[1.7]" style={{ color: 'var(--landing-text-2)' }}>
                  <span
                    className="mt-[0.6em] w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: 'var(--brand-green)' }}
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p
            key={i}
            className="text-[15px] leading-[1.75]"
            style={{ color: 'var(--landing-text-2)', fontWeight: block.strong ? 700 : 400 }}
          >
            {block.text}
          </p>
        )
      })}
    </div>
  )
}

function SectionBlock({ section, index }) {
  const [ref, isVisible] = useIntersectionObserver({ threshold: 0.05 })
  return (
    <section
      ref={ref}
      id={section.id}
      className="scroll-mt-24"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(14px)',
        transition: `opacity 0.45s ease ${Math.min(index * 0.03, 0.3)}s, transform 0.45s ease ${Math.min(index * 0.03, 0.3)}s`,
      }}
    >
      <div className="flex items-baseline gap-3 mb-3">
        <span
          className="text-xs font-black tabular-nums shrink-0"
          style={{ color: 'var(--brand-green)' }}
        >
          {section.num}
        </span>
        <h2 className="text-lg sm:text-xl font-black" style={{ color: 'var(--landing-text)' }}>
          {section.title}
        </h2>
      </div>
      <SectionBody body={section.body} />
    </section>
  )
}

function BackToTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    function onScroll() { setShow(window.scrollY > 700) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!show) return null
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className="fixed bottom-6 right-6 z-30 w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:-translate-y-0.5"
      style={{ background: 'var(--brand-green)', color: '#fff' }}
    >
      <ArrowUp size={18} strokeWidth={2.4} />
    </button>
  )
}

export default function LegalDocLayout({
  eyebrow = 'Legal',
  breadcrumbLabel,
  headingParts,
  intro,
  lastUpdated,
  sections,
  afterSections = null,
}) {
  const [heroRef, heroVisible] = useIntersectionObserver({ threshold: 0.05 })
  const ids = sections.map((s) => s.id)
  const activeId = useActiveSection(ids)

  return (
    <div data-page="landing" style={{ background: 'var(--landing-bg)' }}>
      <Navbar />

      {/* ── Header ── */}
      <section
        ref={heroRef}
        className="relative overflow-hidden"
        style={{ background: 'var(--landing-bg)', paddingTop: '1rem', paddingBottom: '3rem' }}
      >
        <div className="hero-blob-green" style={{ opacity: 0.3 }} />
        <div className="absolute inset-0 dot-grid-bg pointer-events-none opacity-30" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className="flex items-center gap-2 mb-8 text-xs font-semibold"
            style={{ color: 'var(--landing-text-2)', opacity: heroVisible ? 1 : 0, transition: 'opacity 0.5s ease' }}
          >
            <Link href="/" className="hover:underline" style={{ color: 'var(--brand-green)' }}>Home</Link>
            <span style={{ color: 'rgba(0,0,0,0.3)' }}>/</span>
            <span>{breadcrumbLabel}</span>
          </div>

          <div
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 0.6s ease 0.1s, transform 0.6s ease 0.1s',
            }}
          >
            <span
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase w-fit mb-5"
              style={{ background: 'var(--brand-green-dim)', color: 'var(--brand-green)' }}
            >
              <ScrollText size={13} strokeWidth={2.4} />
              {eyebrow}
            </span>

            <GradientHeading
              parts={headingParts}
              className="text-3xl sm:text-4xl lg:text-5xl mb-4"
            />

            <p className="text-sm sm:text-base max-w-2xl leading-relaxed" style={{ color: 'var(--landing-text-2)' }}>
              {intro}
            </p>
            <p className="text-xs font-semibold mt-4" style={{ color: 'rgba(0,0,0,0.4)' }}>
              Last updated: {lastUpdated}
            </p>
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <section style={{ background: '#ffffff', paddingBottom: '5rem' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-10 pt-8">

            <DesktopTOC sections={sections} activeId={activeId} />

            <div className="min-w-0 flex flex-col gap-4">
              <MobileTOC sections={sections} activeId={activeId} />

              <div
                className="rounded-3xl p-6 sm:p-10"
                style={{ background: '#ffffff', border: '1px solid var(--landing-border)' }}
              >
                <div className="flex flex-col gap-10">
                  {sections.map((section, i) => (
                    <SectionBlock key={section.id} section={section} index={i} />
                  ))}
                </div>
                {afterSections}
              </div>
            </div>
          </div>
        </div>
      </section>

      <BackToTop />
      <Footer />
    </div>
  )
}
