import { defineConfig } from 'vite'

export default defineConfig({
  // Root adalah folder project (index.html sudah di root)
  root: '.',

  // Output build ke folder dist/
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Jangan minify terlalu agresif agar tidak merusak logika app
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
    // Copy assets statis (ikon, manifest, sw.js)
    assetsDir: 'assets',
  },

  // Vite dev server config
  server: {
    port: 3000,
    open: true,
  },

  // Preview server (setelah build)
  preview: {
    port: 4173,
  },
})
