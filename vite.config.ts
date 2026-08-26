import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      // FSEvents does not propagate to Vite in this environment, so the module
      // graph never invalidates and edits silently serve stale. Polling costs a
      // little CPU and makes HMR actually fire.
      usePolling: true,
      interval: 300,
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
