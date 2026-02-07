/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  root: __dirname,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'charts': ['recharts'],
          'state': ['zustand'],
          'ui-icons': ['lucide-react'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/__tests__/setup.ts',
    include: ['src/__tests__/**/*.{test,spec}.{ts,tsx}'],
    css: true,
  },
})
