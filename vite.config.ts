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
            // React itself MUST be pinned to its own chunk before any rule
            // below, or Rollup's automatic shared-module placement silently
            // folds it into whichever vendor bucket first imports it.
            // Found 3 Sep 2026 auditing the chunking change below: react-
            // apexcharts's own import of React caused React's core module to
            // land inside vendor-charts, which then forced EVERY chunk in
            // the app (AuthContext, FlowbiteIcons, ModulesContext, all of
            // them - anything that needs React, which is nearly everything)
            // to statically import vendor-charts just to get it. That's what
            // put the ~230KB-gzip ApexCharts bundle back on the eager,
            // modulepreloaded critical path even though AnalyticsDashboard
            // (its only real consumer) is lazy-loaded - turning the chunk
            // split meant to REDUCE first-load JS into a net increase
            // (measured: 647KB -> 856KB gzip critical path). Keeping React
            // isolated here is what lets vendor-charts stay a true
            // dynamic-only dependency of AnalyticsDashboard's own lazy chunk.
            // Path separator matched as [\\/] (not a bare '/'), NOT optional -
            // this build runs on Windows dev machines too, where Rollup's
            // module ids are raw filesystem paths using backslashes; a
            // forward-slash-only check silently never matches there and
            // React falls through unmatched again, silently reintroducing
            // this exact bug (confirmed live: the first version of this fix
            // used '/react/' and produced a byte-identical vendor-charts
            // chunk to the unfixed build - it never actually matched).
            const reactPkgRe = /node_modules[\\/](react|react-dom|scheduler)[\\/]/;
            if (reactPkgRe.test(id) || id.includes('react/jsx-runtime') || id.includes('react/jsx-dev-runtime')) {
              return 'vendor-react';
            }
            // NOT a manual 'vendor-charts' chunk any more (found + reverted 3
            // Sep 2026): pinning apexcharts/react-apexcharts to their own
            // top-level chunk made Rollup pull React's own module into it
            // (confirmed: even after the vendor-react pin above, vendor-charts
            // still ended up with a duplicated copy of react.production.js's
            // code, likely via the commonjs-interop wrapper Rollup generates
            // for these CJS packages getting a different id than the raw
            // file - never fully root-caused, and not worth chasing further
            // when the simple fix is to just not force a split here). Its
            // only consumer, AnalyticsDashboard, is already behind
            // lazyWithRetry() in App.tsx - leaving apexcharts unmatched here
            // lets Rollup's default splitting bundle it into (or alongside)
            // that already-lazy chunk, same as before this file's chunking
            // rules existed. Verified: dist/index.html's modulepreload list
            // no longer includes any chunk containing apexcharts code.
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
