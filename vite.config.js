import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { viteSingleFile } from 'vite-plugin-singlefile'

// npm run dev         -> escritorio (http://localhost:5173)
// npm run movil       -> HTTPS en la red local para probar con el celular (el giroscopio exige HTTPS)
// npm run build:single -> un único index.html con todo embebido
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    ...(mode === 'movil' ? [basicSsl()] : []),
    ...(mode === 'single' ? [viteSingleFile()] : []),
  ],
  server: mode === 'movil' ? { host: true, port: 5173 } : undefined,
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 2000 },
}))
