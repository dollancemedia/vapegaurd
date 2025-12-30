/**
 * Tailwind CSS Configuration for CRA frontend
 */
module.exports = {
  content: [
    './public/index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        mistio: {
          teal: '#00C2CB',
          dark: '#0B1120',
          primary: '#00C2CB',
          secondary: '#0B1120',
        }
      }
    },
  },
  plugins: [],
};
