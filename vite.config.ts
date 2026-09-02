import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('apexcharts') || id.includes('react-apexcharts')) {
              return 'vendor-charts';
            }
            if (id.includes('html2canvas') || id.includes('html-to-image') || id.includes('pdfjs-dist') || id.includes('@zxing')) {
              return 'vendor-imaging';
            }
            if (id.includes('flowbite-react-icons')) {
              return 'vendor-icons';
            }
            if (id.includes('flowbite') || id.includes('flowbite-react')) {
              return 'vendor-flowbite';
            }
          }
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/php': {
        target: 'http://localhost',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: 'localhost',
        rewrite: (path) => path.replace(/^\/php/, '/artists_farm/php'),
      },
      '/artists_farm/php': {
        target: 'http://localhost',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: 'localhost',
        rewrite: (path) => path.replace(/^\/artists_farm\/php/, '/artists_farm/php'),
      }
    }
  },
});
