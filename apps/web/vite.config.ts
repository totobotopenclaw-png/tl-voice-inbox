import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Check if certs exist
const certPath = path.join(__dirname, 'certs')
const hasCerts = fs.existsSync(path.join(certPath, 'cert.pem')) && 
                 fs.existsSync(path.join(certPath, 'key.pem'))

// Get API URL from env or default
const apiUrl = process.env.VITE_API_URL || 'http://localhost:3000'
console.log(`[Vite] Proxying /api to: ${apiUrl}`)

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    https: hasCerts ? {
      cert: fs.readFileSync(path.join(certPath, 'cert.pem')),
      key: fs.readFileSync(path.join(certPath, 'key.pem')),
    } : false,
    proxy: {
      '/api': {
        target: apiUrl,
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[Vite Proxy] error:', err.message)
          })
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] Request:', req.method, req.url, '->', apiUrl + proxyReq.path)
          })
        },
      },
    },
  },
})