/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enables Cache Components — unlocks use cache, cacheLife, cacheTag (stable in Next.js 16)
  cacheComponents: true,

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
      },
    ],
  },

  // Security headers applied to all routes
  async headers() {
    const csp = [
      // Only load scripts from our own origin.
      // unsafe-inline is required by Next.js for its inline hydration scripts.
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      // Inline styles required by Tailwind utilities and Mapbox GL.
      "style-src 'self' 'unsafe-inline'",
      // Mapbox GL renders to a canvas and uses blob: workers; data: for map sprites.
      "img-src 'self' data: blob: https://images.pexels.com https://*.mapbox.com",
      // Mapbox GL JS spins up a Web Worker from a blob: URL.
      "worker-src blob:",
      // API calls: own origin + Mapbox tile/API + Pusher WebSocket channels.
      "connect-src 'self' https://*.mapbox.com https://api.mapbox.com wss://*.pusher.com https://sockjs-mt1.pusher.com https://soketi.app",
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
