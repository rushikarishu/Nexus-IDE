/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from '@vitejs/plugin-react';

export default defineConfig({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    plugins: [react()] as any,
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        globals: true,
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    },
    resolve: {
        alias: {
            // Monaco editor ESM entry for tests
            'monaco-editor': 'monaco-editor/esm/vs/editor/editor.api',
        },
    },
    server: {
        watch: {
            ignored: ['**/src-tauri/target/**', '**/node_modules/**'],
        },
    },
});
