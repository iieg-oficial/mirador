import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta morada institucional IIEG / Jalisco
        iieg: {
          950: '#240d30',
          900: '#381548',
          800: '#4a1d5e',
          700: '#5C2472',  // primary — morado Jalisco
          600: '#7b3699',
          500: '#9a52ba',
          400: '#b57fd0',
          100: '#f3ebf6',
          50:  '#faf5fc',
        },
        // Naranja de acento — color Jalisco
        naranja: {
          600: '#e67600',
          500: '#FF8300',
          100: '#fff4e6',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
