import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--surface-0)',
        foreground: 'var(--text-primary)',
        // Superficies (backgrounds)
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        // Bordes
        border: {
          subtle: 'var(--border-subtle)',
          default: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        // Texto
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        // Marca
        brand: {
          accent: 'var(--brand-accent)',
          cta: 'var(--brand-cta)',
        },
        // Severidades (bg/fg/border) - hex directos sincronizados con src/lib/ui/tokens.ts
        'status-minor': {
          DEFAULT: '#16a34a',
          bg: '#16a34a',
          fg: '#052e16',
          border: '#14532d',
        },
        'status-moderate': {
          // Yellow-500 alineado al principal RutaDeAyuda (#eab308).
          // fg/bg = 9.61:1 WCAG AAA.
          DEFAULT: '#eab308',
          bg: '#eab308',
          fg: '#1c1207',
          border: '#854d0e',
        },
        'status-critical': {
          DEFAULT: '#b91c1c',
          bg: '#b91c1c',
          fg: '#fef2f2',
          border: '#7f1d1d',
        },
        // Triage outcomes (Spec R8 - seismic-triage-upgrade) — 4 escalones
        // bg / fg / border sincronizados con src/lib/ui/tokens.ts
        'triage-habitable': {
          DEFAULT: '#15803d',
          bg: '#15803d',
          fg: '#f0fdf4',
          border: '#14532d',
        },
        'triage-monitoring': {
          // Ambar alineado al dorado del logo. fg/bg = 4.51:1 WCAG AA.
          DEFAULT: '#b45309',
          bg: '#b45309',
          fg: '#fef3c7',
          border: '#7c2d12',
        },
        'triage-unsafe': {
          DEFAULT: '#c2410c',
          bg: '#c2410c',
          fg: '#ffedd5',
          border: '#7c2d12',
        },
        'triage-evacuate': {
          DEFAULT: '#991b1b',
          bg: '#991b1b',
          fg: '#fee2e2',
          border: '#7f1d1d',
        },
      },
      fontFamily: {
        // Familia mono canonica con tnum habilitadas por defecto via clase
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'sync-pulse': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        'ring-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(29 78 216 / 0.6)' },
          '50%': { boxShadow: '0 0 0 8px rgb(29 78 216 / 0)' },
        },
      },
      animation: {
        'sync-pulse': 'sync-pulse 1.4s ease-in-out infinite',
        'ring-pulse': 'ring-pulse 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;