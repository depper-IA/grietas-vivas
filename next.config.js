const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      // Cache-First for shell assets (HTML, CSS, JS, icons, fonts)
      urlPattern:
        /^https?:\/\/.*\.(html|css|js|json|ico|png|svg|woff2?|ttf|eot)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'shell-assets',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
    {
      // Cache-First for Next.js static assets
      urlPattern: /^\/_next\/static\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-static',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year (immutable hashes)
        },
      },
    },
    {
      // Network-First for API/data routes
      urlPattern: /^https?:\/\/.*\/api\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-data',
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        },
      },
    },
    {
      // Network-First for Supabase data
      urlPattern: /^https?:\/\/.*\.supabase\.(co|in)\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'supabase-data',
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        },
      },
    },
    {
      // StaleWhileRevalidate for page navigations
      urlPattern: /^https?:\/\/.*$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'pages',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
};

module.exports = withPWA(nextConfig);
