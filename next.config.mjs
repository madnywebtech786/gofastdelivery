/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enables Cache Components — unlocks use cache, cacheLife, cacheTag (stable in Next.js 16)
  cacheComponents: true,

  // pdfkit resolves font files at runtime via __dirname — bundling it breaks those paths
  serverExternalPackages: ['pdfkit'],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },

  // Security headers applied to all routes
  async headers() {
    const csp = [
      "default-src 'self'",
      // unsafe-inline required by Next.js for inline hydration scripts; Google Maps loader also needs it.
      "script-src 'self' 'unsafe-inline' https://maps.googleapis.com",
      // Inline styles required by Tailwind utilities and Google Maps.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Google Maps renders to a canvas; data: for map sprites.
      "img-src 'self' data: blob: https://maps.googleapis.com https://maps.gstatic.com",
      // Google Maps JS API spins up a Web Worker from a blob: URL.
      "worker-src blob:",
      // API calls: own origin + Google Maps/Places/Routes APIs + Pusher WebSocket channels.
      "connect-src 'self' https://maps.googleapis.com https://places.googleapis.com https://routes.googleapis.com wss://*.pusher.com https://sockjs-mt1.pusher.com https://soketi.app",
      // No frames allowed anywhere.
      "frame-src 'none'",
      // Fonts are self-hosted by next/font — no external font CDN needed.
      "font-src 'self'",
      // Prevent embedding this site in any frame.
      "frame-ancestors 'none'",
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Allow geolocation + speech synthesis on all pages
          { key: 'Permissions-Policy', value: 'geolocation=(self), microphone=(), speaker-selection=(self)' },
          { key: 'Content-Security-Policy', value: csp },
          // Force HTTPS for 1 year (production only — harmless in dev since dev is http)
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },
}

export default nextConfig
