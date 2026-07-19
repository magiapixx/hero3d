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
        // strip dev logging, but keep warn/error — they carry the asset + audio failure paths
        pure_funcs: ["console.log", "console.info", "console.debug"],
      },
    },
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"] }, // own chunk so app edits don't bust the three cache
      },
    },
    // 1MB HDR envmap — the default 4MB warning threshold is fine, but don't inline anything big
    assetsInlineLimit: 4096,
    sourcemap: false,
  },
  server: {
    port: 5173,
    open: true,
  },
})
