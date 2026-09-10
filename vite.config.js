import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['octopus-mark.svg', 'octopus-logo.jpg'],
      manifest: {
        name: 'Octopus Motoboy Control',
        short_name: 'Octopus',
        description: 'Disponibilidade e fila de motoboys em tempo real.',
        theme_color: '#720f2b',
        background_color: '#0f0c0d',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        orientation: 'any',
        icons: [
          { src: '/octopus-logo.jpg', sizes: '635x635', type: 'image/jpeg', purpose: 'any' },
          { src: '/octopus-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/octopus-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
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
