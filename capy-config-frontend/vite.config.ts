import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,  // or whatever Vite’s dev port is
    proxy: {
      // Proxy any request starting with /api to your FastAPI container on port 80
      '/api': {
        target: 'http://localhost:80',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'http://localhost:80',
        changeOrigin: true,
        secure: false,
      },
      '/.well-known': {
        target: 'http://localhost:80',
        changeOrigin: true,
        secure: false,
      },
      '^/$': {
        target: 'http://localhost:80',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
