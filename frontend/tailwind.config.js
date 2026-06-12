/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // AutoCaption brand: deep navy + electric violet + mint accent
        brand: {
          50:  '#f0f0ff',
          100: '#e0e0ff',
          200: '#c5c6ff',
          300: '#a2a4ff',
          400: '#817bff',
          500: '#6b5aff',  // primary
          600: '#5a3ef5',
          700: '#4a2fd6',
          800: '#3d27ae',
          900: '#342489',
          950: '#1e1557',
        },
        surface: {
          DEFAULT: '#0f0e1a',
          card:    '#16142a',
          border:  '#2a2650',
          hover:   '#1e1c35',
        },
        mint: {
          400: '#4eefc7',
          500: '#2dd4aa',
        },
        text: {
          primary:   '#e8e6ff',
          secondary: '#9b98c4',
          muted:     '#5e5c85',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
}
