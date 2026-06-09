import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'

// versão = fonte única no package.json (exposta no header p/ localizar o build)
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))

// Front do app Basalt (Vue 3 + Tailwind).
// root = pasta app/. Em dev, /api é proxied pro backend Express (porta 4317).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4317',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    // BodyEditor (TipTap) e o emoji picker são chunks LAZY (carregam sob demanda);
    // sobe o limite pra não avisar sobre eles — não pesam no bundle inicial (~448KB).
    chunkSizeWarningLimit: 600
  }
})
