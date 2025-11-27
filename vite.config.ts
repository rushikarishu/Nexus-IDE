/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  resolve: {
    alias: {
      // Ensure Monaco uses the ESM editor API entry
      "monaco-editor": "monaco-editor/esm/vs/editor/editor.api",
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**", "**/storage/**"],
    },
  },

  // Build optimizations for code splitting and performance
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Monaco editor in separate chunk (large dependency)
          'monaco': ['monaco-editor', '@monaco-editor/react'],
          // AI features in separate chunk
          'ai': ['./src/components/AIChatPanel', './src/hooks/useAISession'],
          // Debug/test features in separate chunk
          'debug': ['./src/components/DebugPanel', './src/components/TestExplorer'],
          // Plugins in separate chunk
          'plugins': ['./src/components/PluginsPanel', './src/hooks/usePlugins'],
          // React core libraries
          'vendor-react': ['react', 'react-dom'],
          // Lucide icons
          'vendor-icons': ['lucide-react'],
        },
      },
    },
    // Increase chunk size warning limit for Monaco
    chunkSizeWarningLimit: 1000,
    // Enable minification
    minify: 'esbuild' as const,
    // Source maps for debugging (can disable in production)
    sourcemap: true,
  },
}));
