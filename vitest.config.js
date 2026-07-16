import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// Config de teste: habilita o parser de .vue (component tests) sem mexer no
// build do app (app/vite.config.js). Ambiente default = node; os testes de
// componente declaram `// @vitest-environment happy-dom` no topo do arquivo.
export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['app/src/**/*.test.js', 'server/**/*.test.js'],
  },
});
