const path = require('path');

// content em caminho absoluto (independe do cwd com que o Vite roda).
module.exports = {
  darkMode: 'class',
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{vue,js}'),
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#161616',
          900: '#191919',
          850: '#1d1d1d',
          800: '#202020',
          700: '#252525',
          600: '#2a2a2a',
          500: '#2f2f2f',
          line: '#373737',
        },
        txt: '#e9e9e7',
        muted: '#9b9b9b',
        faint: '#6f6f6f',
        accent: '#3b82f6',
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto',
          'Helvetica', 'Arial', 'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
