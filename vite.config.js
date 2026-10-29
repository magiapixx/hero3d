import { defineConfig } from "vite"

export default defineConfig({
  base: "./", // relative asset URLs, so the build works from any sub-path
  root: "./src",
  publicDir: false, // every asset is imported from src/assets, so Vite hashes and emits them
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_debugger: true,
        // strip dev logging, but keep warn/error
        pure_funcs: ["console.log", "console.info", "console.debug"],
      },
    },
    // imported assets over 4kB stay separate hashed files rather than being inlined as base64
    assetsInlineLimit: 4096,
    sourcemap: false,
  },
  server: {
    port: 5173,
    open: true,
  },
})
