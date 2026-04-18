import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const rootDir = resolve('.');

function resolveBuiltAssetPath(assetPath: string): string {
  return resolve(rootDir, 'dist', assetPath.replace(/^\/+/, ''));
}

function inlineUiScriptPlugin(): Plugin {
  return {
    name: 'inline-ui-script',
    async writeBundle() {
      const htmlPath = resolve(rootDir, 'dist/ui.html');
      const html = await readFile(htmlPath, 'utf8');
      let inlinedHtml = html;

      const styleMatches = Array.from(html.matchAll(/<link rel="stylesheet"[^>]+href="([^"]+)">/g));
      for (const match of styleMatches) {
        const assetPath = resolveBuiltAssetPath(match[1]);
        const style = await readFile(assetPath, 'utf8');
        inlinedHtml = inlinedHtml.replace(match[0], `<style>\n${style}\n</style>`);
      }

      const scriptMatch = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
      if (!scriptMatch) {
        throw new Error('Failed to find built UI script tag in ui.html');
      }

      const scriptPath = resolveBuiltAssetPath(scriptMatch[1]);
      const script = await readFile(scriptPath, 'utf8');
      inlinedHtml = inlinedHtml.replace(
        scriptMatch[0],
        `<script>\n${script}\n<\/script>`
      );

      if (inlinedHtml === html) {
        throw new Error('Failed to inline built UI assets into ui.html');
      }

      await writeFile(htmlPath, inlinedHtml, 'utf8');
      await rm(resolve(rootDir, 'dist/assets'), { recursive: true, force: true });
    }
  };
}

export default defineConfig({
  plugins: [svelte(), inlineUiScriptPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        ui: resolve(rootDir, 'ui.html')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    },
    target: 'es2020',
    minify: false
  }
});
