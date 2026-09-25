import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss()],
  // public/ (favicon, ads.txt) só faz falta no bundle do browser — é o
  // server.js que o serve a partir de dist/client
  build: { copyPublicDir: !isSsrBuild },
}))
