/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enables Cache Components — unlocks use cache, cacheLife, cacheTag (stable in Next.js 16)
  cacheComponents: true,

  // Security headers applied to all routes
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Allow geolocation + speech synthesis on all pages
          { key: 'Permissions-Policy', value: 'geolocation=(self), microphone=(), speaker-selection=(self)' },
        ],
      },
    ]
  },
}

export default nextConfig
