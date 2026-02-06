import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Check if certs exist
const certPath = path.join(__dirname, 'certs')
const hasCerts = fs.existsSync(path.join(certPath, 'cert.pem')) && 
                 fs.existsSync(path.join(certPath, 'key.pem'))

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
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})