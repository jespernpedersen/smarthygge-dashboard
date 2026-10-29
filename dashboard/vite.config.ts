import { defineConfig } from 'vite';

// base './' so the build works from Home Assistant's /local/smarthygge/ folder
export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: { outDir: 'dist', assetsDir: 'assets', chunkSizeWarningLimit: 1500 },
});
