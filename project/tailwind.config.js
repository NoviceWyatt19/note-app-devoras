/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#0d0e12',
        darkPanel: '#161821',
        darkBorder: '#272a37',
        primary: '#6366f1',
        accent: '#14b8a6',
        mutedText: '#94a3b8',
      },
    },
  },
  plugins: [],
}
