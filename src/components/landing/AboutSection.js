'use client'
import Image from 'next/image'
import GradientHeading from './GradientHeading'
import { useIntersectionObserver } from './hooks/useIntersectionObserver'
import { useCountUp } from './hooks/useCountUp'

const STATS = [
  { target: 2500, suffix: '+', label: 'Deliveries', sub: 'completed this year' },
  { target: 1200, suffix: '+', label: 'Customers',  sub: 'across Calgary & area' },
  { target: 15,   suffix: '+', label: 'Cities',     sub: 'in our service zone' },
]

const PILLS = ['Same-Day', 'GPS Tracked', 'Door-to-Door', 'Calgary-Based', 'No Hidden Fees']

function StatRow({ stat, active, index }) {
  const count = useCountUp(stat.target, 2000, active)
  return (
    <div
      className="flex items-baseline gap-4 py-5 border-b last:border-b-0"
      style={{
        borderColor: 'rgba(0,0,0,0.07)',
        opacity: active ? 1 : 0,
        transform: active ? 'translateX(0)' : 'translateX(-24px)',
        transition: `opacity 0.55s ease ${0.3 + index * 0.1}s, transform 0.55s ease ${0.3 + index * 0.1}s`,
      }}
    >
      <span
        className="font-black leading-none tabular-nums"
        style={{ fontSize: 'clamp(2.2rem, 4vw, 3rem)', color: 'var(--brand-orange)' }}
      >
        {count.toLocaleString()}{stat.suffix}
      </span>
      <div className="flex flex-col">
        <span className="text-sm font-black" style={{ color: 'var(--landing-text)' }}>{stat.label}</span>
        <span className="text-xs font-medium" style={{ color: 'var(--landing-text-2)' }}>{stat.sub}</span>
      </div>
    </div>
  )
}

export default function AboutSection() {
  const [ref, isVisible] = useIntersectionObserver({ threshold: 0.08 })

  return (
    <section
      id="about"
      ref={ref}
      className="relative overflow-hidden"
      style={{ background: '#ffffff' }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 min-h-170">

        {/* ── LEFT: Full-bleed photo pane — hidden on mobile ── */}
        <div
          className="relative order-2 lg:order-1 hidden lg:block"
          style={{
            clipPath: 'polygon(0 0, 92% 0, 100% 100%, 0 100%)',
          }}
        >
          <Image
            src="https://images.pexels.com/photos/6169668/pexels-photo-6169668.jpeg?auto=compress&cs=tinysrgb&w=900&h=1100&fit=crop"
            alt="GoFastDelivery courier delivering a package"
            fill
            className="object-cover object-center"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />

          {/* Dark gradient from bottom */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(160deg, transparent 40%, rgba(0,0,0,0.55) 100%)' }}
          />

          {/* Floating badge — bottom left of photo */}
          <div
            className="absolute bottom-8 left-8 flex flex-col gap-1"
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? 'translateY(0)' : 'translateY(16px)',
              transition: 'opacity 0.6s ease 0.5s, transform 0.6s ease 0.5s',
            }}
          >
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl w-fit mb-1"
              style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#1bb908', animation: 'ping 1.4s cubic-bezier(0,0,0.2,1) infinite' }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#1bb908' }} />
              </span>
              <span className="text-xs font-black text-white tracking-wide">Live Drivers On Route</span>
            </div>
            <p className="text-2xl font-black text-white leading-tight drop-shadow-lg">
              Calgary&apos;s #1<br />
              <span style={{ color: '#ff580d' }}>Courier Service</span>
            </p>
          </div>

          {/* Year established stamp — top right corner of photo */}
          <div
            className="absolute top-8 right-12 flex flex-col items-center"
            style={{
              opacity: isVisible ? 0.7 : 0,
              transition: 'opacity 0.8s ease 0.4s',
            }}
          >
            <span className="text-[9px] font-black text-white tracking-[0.3em] uppercase">Est.</span>
            <span className="text-3xl font-black text-white leading-none">2022</span>
          </div>
        </div>

        {/* ── RIGHT: Content pane ── */}
        <div
          className="relative order-1 lg:order-2 flex flex-col justify-center px-8 sm:px-12 lg:px-16 py-20 lg:py-24 overflow-hidden"
          style={{ background: '#ffffff' }}
        >
          {/* Giant watermark word */}
          <span
            className="absolute right-0 top-1/2 -translate-y-1/2 font-black select-none pointer-events-none leading-none"
            style={{
              fontSize: 'clamp(6rem, 14vw, 11rem)',
              color: 'rgba(255,88,13,0.05)',
              letterSpacing: '-0.05em',
              right: '-0.1em',
              whiteSpace: 'nowrap',
            }}
            aria-hidden="true"
          >
            FAST.
          </span>

          {/* Content */}
          <div className="relative flex flex-col gap-6 max-w-lg">

            {/* Label */}
            <div
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s',
              }}
            >
              <span
                className="inline-flex px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase"
                style={{ background: 'var(--brand-green-dim)', color: 'var(--brand-green)' }}
              >
                About GoFastDelivery
              </span>
            </div>

            {/* Heading */}
            <div
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.5s ease 0.18s, transform 0.5s ease 0.18s',
              }}
            >
              <GradientHeading
                parts={[
                  { text: "Calgary's ", color: 'black' },
                  { text: 'Most Trusted', color: 'orange', highlight: true },
                  { text: '\nCourier', color: 'green' },
                ]}
                className="text-3xl sm:text-4xl lg:text-5xl"
              />
            </div>

            {/* Body copy */}
            <div
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.5s ease 0.26s, transform 0.5s ease 0.26s',
              }}
            >
              <p className="text-base leading-relaxed" style={{ color: 'var(--landing-text-2)' }}>
                GoFastDelivery is Calgary&apos;s premier same-day courier — built on speed, reliability, and care that big logistics companies can&apos;t match. Every delivery is handled by a verified local driver and tracked live.
              </p>
            </div>

            {/* Pill tags */}
            <div
              className="flex flex-wrap gap-2"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(16px)',
                transition: 'opacity 0.5s ease 0.34s, transform 0.5s ease 0.34s',
              }}
            >
              {PILLS.map((pill, i) => (
                <span
                  key={pill}
                  className="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider"
                  style={{
                    background: i % 2 === 0 ? 'var(--brand-orange-dim)' : 'var(--brand-green-dim)',
                    color: i % 2 === 0 ? 'var(--brand-orange)' : 'var(--brand-green)',
                  }}
                >
                  {pill}
                </span>
              ))}
            </div>

            {/* Divider */}
            <div
              className="h-px w-full"
              style={{
                background: 'linear-gradient(90deg, var(--brand-orange), var(--brand-green), transparent)',
                opacity: 0.2,
              }}
            />

            {/* Stats — vertical typographic stack */}
            <div className="flex flex-col">
              {STATS.map((stat, i) => (
                <StatRow key={stat.label} stat={stat} active={isVisible} index={i} />
              ))}
            </div>

            {/* CTA */}
            <div
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(16px)',
                transition: 'opacity 0.5s ease 0.65s, transform 0.5s ease 0.65s',
              }}
            >
              <a
                href="/login"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-white font-black text-sm transition-all hover:opacity-90 shadow-lg"
                style={{ background: 'var(--brand-orange)' }}
              >
                Start a Delivery
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a>
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}
