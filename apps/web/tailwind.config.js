/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'l2-dark': '#0e141b',
        'l2-panel': '#2a313b',
        'l2-gold': '#D6B36A',
        'l2-health': '#C41E3A',
        'l2-energy': '#3498DB',
        'l2-crit': '#FF4444',
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
      },
    },
  },
  plugins: [],
};
