import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      fs: resolve(projectRoot, 'src/shims/fs-browser.ts'),
    },
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Vue PWA DuckDB Hello',
        short_name: 'DuckDBHello',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/assets\/lemmas\.bin$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'lemmas-cache',
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
        additionalManifestEntries: [
          { url: '/assets/lemmas.json.gz', revision: null },
        ],
      }
    })
  ]
})
