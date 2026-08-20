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
  async headers() {
    // Derivado del env var en vez de hardcodear el project ref: next.config.js
    // corre en Node en build/start time, así que esto sigue el mismo proyecto
    // Supabase que use el deploy (dev/staging/prod), sin duplicar la fuente
    // de verdad. NEXT_PUBLIC_* ya viaja al bundle del cliente de todos modos.
    const supabaseOrigin = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(
      /\/$/,
      ''
    );

    // Hosts de los proveedores de IA para BYOK: esas llamadas van directo del
    // navegador al proveedor (la clave del usuario nunca toca nuestro backend),
    // así que connect-src debe permitirlas explícitamente.
    const aiProviderOrigins = [
      'https://api.anthropic.com',
      'https://api.openai.com',
      'https://api.minimax.io',
      'https://generativelanguage.googleapis.com',
      'https://integrate.api.nvidia.com',
      'https://openrouter.ai',
    ].join(' ');

    const csp = [
      "default-src 'self'",
      // 'unsafe-inline' es necesario: el streaming de hidratación de RSC de
      // Next.js App Router inyecta <script>self.__next_f.push(...)</script>
      // inline y ejecutable (verificado leyendo el HTML generado por el
      // build, no es una isla JSON inerte) — sin esto la app queda estática,
      // sin hidratar, en cualquier navegador. Un CSP con nonce por-request
      // es la alternativa correcta, pero requiere verificación visual en
      // navegador real que no está disponible en este entorno; se prefiere
      // no shippear una config de nonce sin poder confirmar que no rompe
      // la hidratación en silencio.
      "script-src 'self' 'unsafe-inline'",
      // 'unsafe-inline' aquí es por el prop style={{}} de React (ej. el
      // pan/zoom de ImageZoomModal), que compila a atributo style="" inline.
      // No existe mecanismo de nonce para atributos style, solo para <style>.
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
      `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ''} ${aiProviderOrigins}`,
      "font-src 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            // camera y geolocation son funciones reales de la app (captura
            // + GPS de reportes); todo lo demás queda cerrado.
            key: 'Permissions-Policy',
            value:
              'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
