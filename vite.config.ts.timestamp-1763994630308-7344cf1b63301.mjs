// vite.config.ts
import { defineConfig } from "file:///home/projectbasecamp/Desktop/Griffindor/nexus-ide/node_modules/vite/dist/node/index.js";
import react from "file:///home/projectbasecamp/Desktop/Griffindor/nexus-ide/node_modules/@vitejs/plugin-react/dist/index.js";
var host = process.env.TAURI_DEV_HOST;
var vite_config_default = defineConfig(() => ({
  plugins: [react()],
  resolve: {
    alias: {
      // Ensure Monaco uses the ESM editor API entry
      "monaco-editor": "monaco-editor/esm/vs/editor/editor.api"
    }
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
    hmr: host ? {
      protocol: "ws",
      host,
      port: 1421
    } : void 0,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"]
    }
  },
  // Build optimizations for code splitting and performance
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Monaco editor in separate chunk (large dependency)
          "monaco": ["monaco-editor", "@monaco-editor/react"],
          // AI features in separate chunk
          "ai": ["./src/components/AIChatPanel", "./src/hooks/useAISession"],
          // Debug/test features in separate chunk
          "debug": ["./src/components/DebugPanel", "./src/components/TestExplorer"],
          // Plugins in separate chunk
          "plugins": ["./src/components/PluginsPanel", "./src/hooks/usePlugins"],
          // React core libraries
          "vendor-react": ["react", "react-dom"],
          // Lucide icons
          "vendor-icons": ["lucide-react"]
        }
      }
    },
    // Increase chunk size warning limit for Monaco
    chunkSizeWarningLimit: 1e3,
    // Enable minification
    minify: "esbuild",
    // Source maps for debugging (can disable in production)
    sourcemap: true
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0YmFzZWNhbXAvRGVza3RvcC9HcmlmZmluZG9yL25leHVzLWlkZVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvcHJvamVjdGJhc2VjYW1wL0Rlc2t0b3AvR3JpZmZpbmRvci9uZXh1cy1pZGUvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvcHJvamVjdGJhc2VjYW1wL0Rlc2t0b3AvR3JpZmZpbmRvci9uZXh1cy1pZGUvdml0ZS5jb25maWcudHNcIjsvLy8gPHJlZmVyZW5jZSB0eXBlcz1cInZpdGVzdFwiIC8+XG5pbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xuXG5jb25zdCBob3N0ID0gcHJvY2Vzcy5lbnYuVEFVUklfREVWX0hPU1Q7XG5cbi8vIGh0dHBzOi8vdml0ZS5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCgpID0+ICh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcblxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgIC8vIEVuc3VyZSBNb25hY28gdXNlcyB0aGUgRVNNIGVkaXRvciBBUEkgZW50cnlcbiAgICAgIFwibW9uYWNvLWVkaXRvclwiOiBcIm1vbmFjby1lZGl0b3IvZXNtL3ZzL2VkaXRvci9lZGl0b3IuYXBpXCIsXG4gICAgfSxcbiAgfSxcblxuICAvLyBWaXRlIG9wdGlvbnMgdGFpbG9yZWQgZm9yIFRhdXJpIGRldmVsb3BtZW50IGFuZCBvbmx5IGFwcGxpZWQgaW4gYHRhdXJpIGRldmAgb3IgYHRhdXJpIGJ1aWxkYFxuICAvL1xuICAvLyAxLiBwcmV2ZW50IFZpdGUgZnJvbSBvYnNjdXJpbmcgcnVzdCBlcnJvcnNcbiAgY2xlYXJTY3JlZW46IGZhbHNlLFxuICAvLyAyLiB0YXVyaSBleHBlY3RzIGEgZml4ZWQgcG9ydCwgZmFpbCBpZiB0aGF0IHBvcnQgaXMgbm90IGF2YWlsYWJsZVxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiAxNDIwLFxuICAgIHN0cmljdFBvcnQ6IHRydWUsXG4gICAgaG9zdDogaG9zdCB8fCBmYWxzZSxcbiAgICBobXI6IGhvc3RcbiAgICAgID8ge1xuICAgICAgICBwcm90b2NvbDogXCJ3c1wiLFxuICAgICAgICBob3N0LFxuICAgICAgICBwb3J0OiAxNDIxLFxuICAgICAgfVxuICAgICAgOiB1bmRlZmluZWQsXG4gICAgd2F0Y2g6IHtcbiAgICAgIC8vIDMuIHRlbGwgVml0ZSB0byBpZ25vcmUgd2F0Y2hpbmcgYHNyYy10YXVyaWBcbiAgICAgIGlnbm9yZWQ6IFtcIioqL3NyYy10YXVyaS8qKlwiXSxcbiAgICB9LFxuICB9LFxuXG4gIC8vIEJ1aWxkIG9wdGltaXphdGlvbnMgZm9yIGNvZGUgc3BsaXR0aW5nIGFuZCBwZXJmb3JtYW5jZVxuICBidWlsZDoge1xuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIG91dHB1dDoge1xuICAgICAgICBtYW51YWxDaHVua3M6IHtcbiAgICAgICAgICAvLyBNb25hY28gZWRpdG9yIGluIHNlcGFyYXRlIGNodW5rIChsYXJnZSBkZXBlbmRlbmN5KVxuICAgICAgICAgICdtb25hY28nOiBbJ21vbmFjby1lZGl0b3InLCAnQG1vbmFjby1lZGl0b3IvcmVhY3QnXSxcbiAgICAgICAgICAvLyBBSSBmZWF0dXJlcyBpbiBzZXBhcmF0ZSBjaHVua1xuICAgICAgICAgICdhaSc6IFsnLi9zcmMvY29tcG9uZW50cy9BSUNoYXRQYW5lbCcsICcuL3NyYy9ob29rcy91c2VBSVNlc3Npb24nXSxcbiAgICAgICAgICAvLyBEZWJ1Zy90ZXN0IGZlYXR1cmVzIGluIHNlcGFyYXRlIGNodW5rXG4gICAgICAgICAgJ2RlYnVnJzogWycuL3NyYy9jb21wb25lbnRzL0RlYnVnUGFuZWwnLCAnLi9zcmMvY29tcG9uZW50cy9UZXN0RXhwbG9yZXInXSxcbiAgICAgICAgICAvLyBQbHVnaW5zIGluIHNlcGFyYXRlIGNodW5rXG4gICAgICAgICAgJ3BsdWdpbnMnOiBbJy4vc3JjL2NvbXBvbmVudHMvUGx1Z2luc1BhbmVsJywgJy4vc3JjL2hvb2tzL3VzZVBsdWdpbnMnXSxcbiAgICAgICAgICAvLyBSZWFjdCBjb3JlIGxpYnJhcmllc1xuICAgICAgICAgICd2ZW5kb3ItcmVhY3QnOiBbJ3JlYWN0JywgJ3JlYWN0LWRvbSddLFxuICAgICAgICAgIC8vIEx1Y2lkZSBpY29uc1xuICAgICAgICAgICd2ZW5kb3ItaWNvbnMnOiBbJ2x1Y2lkZS1yZWFjdCddLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIC8vIEluY3JlYXNlIGNodW5rIHNpemUgd2FybmluZyBsaW1pdCBmb3IgTW9uYWNvXG4gICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiAxMDAwLFxuICAgIC8vIEVuYWJsZSBtaW5pZmljYXRpb25cbiAgICBtaW5pZnk6ICdlc2J1aWxkJyxcbiAgICAvLyBTb3VyY2UgbWFwcyBmb3IgZGVidWdnaW5nIChjYW4gZGlzYWJsZSBpbiBwcm9kdWN0aW9uKVxuICAgIHNvdXJjZW1hcDogdHJ1ZSxcbiAgfSxcbn0pKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFDQSxTQUFTLG9CQUFvQjtBQUM3QixPQUFPLFdBQVc7QUFFbEIsSUFBTSxPQUFPLFFBQVEsSUFBSTtBQUd6QixJQUFPLHNCQUFRLGFBQWEsT0FBTztBQUFBLEVBQ2pDLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxFQUVqQixTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUE7QUFBQSxNQUVMLGlCQUFpQjtBQUFBLElBQ25CO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsYUFBYTtBQUFBO0FBQUEsRUFFYixRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsSUFDWixNQUFNLFFBQVE7QUFBQSxJQUNkLEtBQUssT0FDRDtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQ1Y7QUFBQSxNQUNBLE1BQU07QUFBQSxJQUNSLElBQ0U7QUFBQSxJQUNKLE9BQU87QUFBQTtBQUFBLE1BRUwsU0FBUyxDQUFDLGlCQUFpQjtBQUFBLElBQzdCO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFHQSxPQUFPO0FBQUEsSUFDTCxlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixjQUFjO0FBQUE7QUFBQSxVQUVaLFVBQVUsQ0FBQyxpQkFBaUIsc0JBQXNCO0FBQUE7QUFBQSxVQUVsRCxNQUFNLENBQUMsZ0NBQWdDLDBCQUEwQjtBQUFBO0FBQUEsVUFFakUsU0FBUyxDQUFDLCtCQUErQiwrQkFBK0I7QUFBQTtBQUFBLFVBRXhFLFdBQVcsQ0FBQyxpQ0FBaUMsd0JBQXdCO0FBQUE7QUFBQSxVQUVyRSxnQkFBZ0IsQ0FBQyxTQUFTLFdBQVc7QUFBQTtBQUFBLFVBRXJDLGdCQUFnQixDQUFDLGNBQWM7QUFBQSxRQUNqQztBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUE7QUFBQSxJQUVBLHVCQUF1QjtBQUFBO0FBQUEsSUFFdkIsUUFBUTtBQUFBO0FBQUEsSUFFUixXQUFXO0FBQUEsRUFDYjtBQUNGLEVBQUU7IiwKICAibmFtZXMiOiBbXQp9Cg==
