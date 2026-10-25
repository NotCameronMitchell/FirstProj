import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The single-file build has no sibling files, so drop links to the PWA manifest and icons.
const stripPwaLinks: Plugin = {
  name: 'strip-pwa-links',
  transformIndexHtml: (html) => html.replace(/\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>/g, ''),
};

// `--mode single` produces one self-contained index.html (no service worker),
// handy for sharing the game as a single file.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile(), stripPwaLinks] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    copyPublicDir: mode !== 'single',
  },
  define: {
    __SINGLE_FILE__: JSON.stringify(mode === 'single'),
  },
}));
