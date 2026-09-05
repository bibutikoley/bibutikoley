import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { fileURLToPath } from 'node:url';

// The site is served from the root of bibutikoley.github.io, so asset URLs
// are absolute. `@data` points at the repo-level data/ folder so the curated
// project blurbs are shared with the Python generator.
export default defineConfig({
  base: '/',
  plugins: [glsl()],
  resolve: {
    alias: {
      '@data': fileURLToPath(new URL('../data', import.meta.url)),
    },
  },
  server: {
    fs: { allow: ['..'] },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep the three.js core in its own long-cacheable chunk.
        manualChunks(id) {
          if (id.includes('node_modules/three/') && !id.includes('/examples/')) return 'three';
          return undefined;
        },
      },
    },
  },
});
