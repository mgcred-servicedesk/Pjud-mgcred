import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento o Vite repassa /api para a API (APP_ORIGIN da API deve ser http://127.0.0.1:5173).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4320' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
