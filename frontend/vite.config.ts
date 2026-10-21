import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_BACKEND_URL || 'http://localhost:4000'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // same-origin api calls in dev, so the session cookie just works
      proxy: {
        '/api': backend,
        '/admin': backend,
      },
    },
  }
})
