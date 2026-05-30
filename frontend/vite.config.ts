import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Hệ Thống Điều Hành Cấp Xã',
        short_name: 'IOC Cấp Xã',
        description: 'Hệ thống điều hành thông minh cấp xã - IOC Platform',
        theme_color: '#0d1526',
        background_color: '#f0f2f5',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/dashboard',
        lang: 'vi',
        icons: [
          { src: '/logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/logo.png', sizes: 'any',     type: 'image/png' },
        ],
        shortcuts: [
          { name: 'Nhiệm vụ',  url: '/tasks',    icons: [{ src: '/logo.png', sizes: '96x96' }] },
          { name: 'Dashboard', url: '/dashboard', icons: [{ src: '/logo.png', sizes: '96x96' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/v1\/(dashboard|tasks\/stats|kpi\/stats)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-stats-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /^https?:\/\/.*\/api\/v1\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
