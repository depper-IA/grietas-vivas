import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Grietas Vivas - Triaje Estructural Post-Sismo',
    short_name: 'Grietas Vivas',
    description:
      'Aplicación de triaje de grietas post-sismo para documentar daños estructurales con metadatos legales',
    lang: 'es',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#dc2626',
    background_color: '#fef2f2',
    categories: ['utilities', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
