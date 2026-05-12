import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Split vendor chunks so React + Leaflet don't all land in the
        // same hashed file. Browser can cache them across deploys, and
        // the initial parse-cost is paid in parallel chunks.
        manualChunks: {
          react: ['react', 'react-dom'],
          leaflet: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Radar Wojskowy',
        short_name: 'Radar PL',
        description: 'Śledzenie wojskowych samolotów w Polsce',
        theme_color: '#080f1c',
        background_color: '#080f1c',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        importScripts: ['/push-handler.js'],
        runtimeCaching: [
          {
            // OSM uses subdomains a/b/c — earlier regex didn't include them,
            // so tiles were never cached.
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 400, maxAgeSeconds: 86400 * 7 }
            }
          },
          {
            urlPattern: /^https:\/\/[a-z]\.basemaps\.cartocdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'carto-tiles',
              expiration: { maxEntries: 400, maxAgeSeconds: 86400 * 7 }
            }
          },
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'esri-tiles',
              expiration: { maxEntries: 400, maxAgeSeconds: 86400 * 7 }
            }
          },
          {
            // planespotters photo thumbnails — cache for a day, network-first
            // so we still get fresh photos when planespotters updates them.
            urlPattern: /^https:\/\/api\.planespotters\.net\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'planespotters-photos',
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
            },
          },
        ]
      }
    })
  ]
})
