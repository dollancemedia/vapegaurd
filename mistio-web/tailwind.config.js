/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'mistio-teal': '#00d2d3', // Approximate from description
        'mistio-dark': '#0f172a', // Dark navy/charcoal
        'mistio-gray': '#64748b',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'], // Assuming Inter or similar
      },
    },
  },
  plugins: [],
}