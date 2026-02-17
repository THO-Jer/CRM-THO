/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        naranja: '#FF8C42',
        verde: '#8BC34A',
        azul: '#42A5F5',
        fucsia: '#E91E8C',
      }
    },
  },
  plugins: [],
}
