import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const rootDir = resolve('.');

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: 'dist',
    lib: {
      entry: resolve(rootDir, 'src/plugin/index.ts'),
      formats: ['iife'],
      name: 'PencilToFigmaPlugin',
      fileName: () => 'code.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    },
    // Figma plugin runtime can choke on newer syntax like ??, ?., and object spread,
    // so emit an older target for the plugin entry bundle.
    target: 'es2017',
    minify: false
  }
});
