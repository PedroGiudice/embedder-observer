import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 5174,
    strictPort: true,
    host: '0.0.0.0',
    proxy: {
      // Proxy para embedder-d (localhost:8081 na VM)
      '/proxy/embedder-d': {
        target: 'http://localhost:8081',
        rewrite: (path) => path.replace('/proxy/embedder-d', ''),
        changeOrigin: true,
        // SSE requer streaming sem buffer
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, req) => {
            if (req.url?.includes('/api/events')) {
              _proxyReq.setHeader('Accept', 'text/event-stream')
              _proxyReq.setHeader('Cache-Control', 'no-cache')
            }
          })
          proxy.on('proxyRes', (proxyRes, req) => {
            if (req.url?.includes('/api/events')) {
              proxyRes.headers['x-accel-buffering'] = 'no'
              proxyRes.headers['cache-control'] = 'no-cache'
            }
          })
        },
      },
      // Proxy para cogmem (localhost:3939 na VM)
      '/proxy/cogmem': {
        target: 'http://localhost:3939',
        rewrite: (path) => path.replace('/proxy/cogmem', ''),
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req) => {
            if (req.url?.includes('/api/events')) {
              proxyRes.headers['x-accel-buffering'] = 'no'
              proxyRes.headers['cache-control'] = 'no-cache'
            }
          })
        },
      },
    },
  },
})
