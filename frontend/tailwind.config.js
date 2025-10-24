/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // DevReady Kit components
    "./node_modules/@peppermint-design/devreadykit/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // EMS Brand Colors
        peak: {
          DEFAULT: '#EF4444', // red-500
          light: '#FCA5A5',   // red-300
          dark: '#B91C1C',    // red-700
        },
        offpeak: {
          DEFAULT: '#10B981', // green-500
          light: '#6EE7B7',   // green-300
          dark: '#047857',    // green-700
        },
      },
    },
  },
  plugins: [],
}
