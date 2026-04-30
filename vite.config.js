import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  base: "/gastos/", // <- nombre del repo
  server: {
    host: true,
    // si hace falta explícitamente:
    allowedHosts: true
  },
})
