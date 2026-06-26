import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta institucional IIEG
        iieg: {
          950: '#071628',
          900: '#0c2340',
          800: '#123a6b',
          700: '#1a5296',
          600: '#2368b0',
          500: '#2e7fcb',
          400: '#5b9fd6',
          100: '#dbeafe',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
