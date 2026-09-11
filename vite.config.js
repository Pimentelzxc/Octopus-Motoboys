import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['octopus-logo.jpg', 'pwa-icon-192.png', 'pwa-icon-512.png', 'pwa-icon-maskable-512.png'],
      manifest: {
        name: 'Octopus Motoboy Control',
        short_name: 'Octopus',
        description: 'Disponibilidade e fila de motoboys em tempo real.',
        theme_color: '#720f2b',
        background_color: '#0f0c0d',
        display: 'standalone',
        id: '/',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        orientation: 'any',
        icons: [
          { src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        importScripts: ['/push-sw.js'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\//i,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ]
})
