import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Znacznik budowy w stopce ustawień. PWA aktualizuje się dopiero przy
  // kolejnym uruchomieniu, więc bez tego nie da się stwierdzić, czy telefon
  // ogląda już nową wersję, czy wciąż starą z cache'u service workera.
  define: { __BUILD_STAMP__: JSON.stringify(new Date().toISOString().slice(5, 16).replace('T', ' ')) },
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
        // `maskable` dostaje WŁASNY plik z zapasem przy krawędziach. Wcześniej
        // ta sama grafika była zgłaszana jako 'any maskable', więc Android
        // przycinał ją do koła razem z treścią sięgającą brzegu.
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        importScripts: ['/push-handler.js'],
        // Nowa wersja przejmuje sterowanie NATYCHMIAST, a nie przy kolejnym
        // uruchomieniu. Bez tego PWA po zbiciu i otwarciu ładowała się jeszcze
        // ze starego cache'u i dopiero drugie otwarcie pokazywało zmiany —
        // przy diagnozowaniu układu oznaczało to, że nigdy nie było wiadomo,
        // czy telefon ogląda poprawkę, czy wersję sprzed niej.
        skipWaiting: true,
        clientsClaim: true,
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
