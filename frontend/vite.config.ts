import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const BUILD_TIME = new Date().toISOString();
const COMMIT = (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7);

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __COMMIT__: JSON.stringify(COMMIT),
  },
  server: {
    proxy: { '/api': process.env.DEV_API_URL || 'http://localhost:3001' },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['*.png', '*.svg', '*.ico'],
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    })
  ]
})
