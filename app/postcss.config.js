const path = require('path');

// Referência explícita ao tailwind.config.js de app/ (cwd do Vite pode ser a raiz).
module.exports = {
  plugins: {
    tailwindcss: { config: path.join(__dirname, 'tailwind.config.js') },
    autoprefixer: {},
  },
};
