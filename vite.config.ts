import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` produces one self-contained index.html (no service worker),
// handy for sharing the game as a single file.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    copyPublicDir: mode !== 'single',
  },
  define: {
    __SINGLE_FILE__: JSON.stringify(mode === 'single'),
  },
}));
