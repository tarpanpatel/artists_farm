import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Stamps sw.js's CACHE_NAME with the built entry bundle's content hash.
 *
 * Why this has to be automatic (6 Sep 2026, after "stuck at loading when
 * switching properties" was reported yet again): a browser only installs a new
 * service worker when sw.js's BYTES change. sw.js's cache version was bumped by
 * hand - and by the time this was written it had sat on 'farm-pos-v54' for 84
 * commits and many deploys. An unchanged sw.js means the old worker never
 * re-installs, never runs its `activate` handler, and so never wipes its caches
 * - while it keeps answering every HTML navigation stale-while-revalidate from
 * a pre-deploy shell. Each deploy `rsync --delete`s dist/assets, so that shell
 * points at a hashed bundle that no longer exists: the entry <script> 404s,
 * React never mounts, and index.html's static #initial-loader spins forever.
 *
 * Keying the cache name to the entry hash makes the coupling exact - the bundle
 * changed, therefore sw.js changed, therefore a new worker installs and wipes
 * every stale cache. Nothing left to remember.
 *
 * NOTE: sw.js is served from the repo root (it needs root scope to control
 * /{tenant}/{property}/ navigations, so it can't live in dist/), and reaches the
 * server via the deploy's `git checkout` - NOT in the dist tarball. So the
 * rewrite this makes must be committed for a deploy to actually carry it.
 */
function stampServiceWorkerVersion(): Plugin {
  return {
    name: 'stamp-service-worker-version',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(__dirname, 'sw.js');
      const htmlPath = resolve(__dirname, 'dist', 'index.html');
      if (!existsSync(swPath) || !existsSync(htmlPath)) return;

      const entry = readFileSync(htmlPath, 'utf-8').match(/assets\/(index-[A-Za-z0-9_-]+)\.js/);
      if (!entry) {
        this.warn('sw.js version NOT stamped: no entry bundle found in dist/index.html');
        return;
      }
      const version = entry[1].replace(/^index-/, '');

      const sw = readFileSync(swPath, 'utf-8');
      const stamped = sw.replace(
        /const CACHE_NAME = '[^']*';/,
        `const CACHE_NAME = 'farm-pos-${version}';`
      );
      if (stamped === sw) return;
      writeFileSync(swPath, stamped);
      console.log(`  sw.js CACHE_NAME -> farm-pos-${version}`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), stampServiceWorkerVersion()],
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
