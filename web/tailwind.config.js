/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          light: '#fafaf9',
          dark: '#0d0d0e',
          soft: '#f4f1ea',
        },
        panel: {
          light: '#ffffff',
          dark: '#171719',
        },
        ink: {
          light: '#0a0a0a',
          dark: '#fafafa',
          '2-light': '#6b6b6b',
          '2-dark': '#9a9a9d',
          '3-light': '#a3a3a3',
          '3-dark': '#5e5e62',
        },
        line: {
          light: '#ececec',
          dark: '#232326',
          '2-light': '#f4f4f3',
          '2-dark': '#1c1c1f',
        },
        accent: {
          DEFAULT: '#ff5a1f',
          dark: '#ff6a34',
          soft: '#fff2ea',
          'soft-dark': '#2a1810',
        },
        distant: {
          DEFAULT: '#3b7cbf',
          dark: '#5a9ce0',
          soft: '#eaf1fa',
          'soft-dark': '#0f2340',
        },
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
