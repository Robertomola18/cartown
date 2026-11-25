import { defineConfig } from 'vite';

const base = process.env.VITE_CARTON_BASE || '/cartown/';

export default defineConfig({
  base,
  server: {
    host: true,
    port: 5173,
    // The game needs the Node server for auth and saves, also in dev.
    proxy: {
      '/cartown/api': 'http://localhost:3000',
      '/cartown/login': 'http://localhost:3000',
      '/cartown/register': 'http://localhost:3000',
      '/cartown/logout': 'http://localhost:3000',
      '/cartown/health': 'http://localhost:3000',
      '/cartown/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
