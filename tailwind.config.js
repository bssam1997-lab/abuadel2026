/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#0f172a',
      },
      boxShadow: {
        soft: '0 4px 24px -8px rgba(15,23,42,0.12)',
      },
    },
  },
  plugins: [],
};
