import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default defineConfig({
  plugins: viteConfig.plugins ?? [],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    root: fileURLToPath(new URL('./', import.meta.url)),
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
    setupFiles: ['tests/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 10000,
  },
});
