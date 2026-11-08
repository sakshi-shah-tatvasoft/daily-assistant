/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        // Bloom palette — teal primary, saffron accent, warm cream background
        brand: {
          50:  '#EEF8F6',
          100: '#D5ECE8',
          200: '#ABD9D1',
          300: '#78BFB4',
          400: '#3E9E92',
          500: '#14857A',
          600: '#0F766E',
          700: '#0C5F59',
          800: '#0A4C47',
          900: '#083D3A',
          950: '#04201E',
        },
        saffron: { 400: '#F7B84B', 500: '#F5A524', 600: '#D98B0B' },
        cream:   '#FBF7F0'
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
