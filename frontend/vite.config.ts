import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // On GitHub Pages deployments, assets must be served from /<repo-name>/
  // The workflow will set BASE_PATH to '/<repo>/' so URLs resolve correctly.
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Allow external connections
    proxy: {
      // Proxy API requests to backend
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
