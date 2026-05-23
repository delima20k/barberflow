import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import viteCompression from 'vite-plugin-compression';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ViteConfigFactory {
  static create() {
    return {
      root: __dirname,
      publicDir: false,
      resolve: {
        alias: {
          '@': __dirname,
          '@apps': path.resolve(__dirname, 'apps'),
          '@cliente': path.resolve(__dirname, 'apps/cliente/assets/js'),
          '@profissional': path.resolve(__dirname, 'apps/profissional/assets/js'),
          '@shared': path.resolve(__dirname, 'shared/js'),
          '@sections': path.resolve(__dirname, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage'),
          '@vite-runtime': path.resolve(__dirname, 'src/vite'),
        },
      },
      server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: false,
        hmr: true,
      },
      build: {
        outDir: 'dist/vite',
        emptyOutDir: true,
        manifest: true,
        sourcemap: true,
        cssCodeSplit: true,
        target: 'es2022',
        rollupOptions: {
          input: {
            profissionalHtml: path.resolve(__dirname, 'apps/profissional/index.html'),
            clienteHtml: path.resolve(__dirname, 'apps/cliente/index.html'),
            profissional: path.resolve(__dirname, 'src/vite/profissional-entry.js'),
            cliente: path.resolve(__dirname, 'src/vite/cliente-entry.js'),
          },
          output: {
            entryFileNames: 'assets/[name]-[hash].js',
            chunkFileNames: 'assets/chunks/[name]-[hash].js',
            assetFileNames: 'assets/[name]-[hash][extname]',
            manualChunks: ViteConfigFactory.manualChunks,
          },
        },
      },
      plugins: [
        visualizer({
          filename: path.resolve(__dirname, 'docs/perf/fase-3/bundle.html'),
          template: 'treemap',
          gzipSize: true,
          brotliSize: true,
          sourcemap: true,
        }),
        viteCompression({ algorithm: 'gzip', ext: '.gz' }),
        viteCompression({ algorithm: 'brotliCompress', ext: '.br' }),
      ],
    };
  }

  static manualChunks(id) {
    if (id.includes('node_modules/@supabase')) return 'vendor-supabase';
    if (id.includes('node_modules/leaflet')) return 'vendor-maps';
    if (id.includes('node_modules')) return 'vendor';
    if (id.includes('MinhaBarbeariaPage/StorySection')) return 'section-story';
    if (id.includes('MinhaBarbeariaPage/PortfolioSection')) return 'section-portfolio';
    if (id.includes('MinhaBarbeariaPage/QueueSection')) return 'section-queue';
    if (id.includes('MinhaBarbeariaPage/NotificationSection')) return 'section-notification';
    if (id.includes('MinhaBarbeariaPage/SettingsSection')) return 'section-settings';
    if (id.includes('MinhaBarbeariaPage/AnalyticsSection')) return 'section-analytics';
    if (id.includes('MinhaBarbeariaPage/AgendaSection')) return 'section-agenda';
    if (id.includes('MapWidget') || id.includes('MapPanel') || id.includes('MapOrientation')) return 'feature-maps';
    return undefined;
  }
}

export default defineConfig(ViteConfigFactory.create());
