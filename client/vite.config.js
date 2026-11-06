import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API_PORT lets several dev backends run side by side (default 3001).
const api = process.env.API_PORT || 3001;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT || 5173),
    proxy: {
      '/api': `http://localhost:${api}`,
      '/ws': { target: `ws://localhost:${api}`, ws: true },
    },
  },
});
