import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const repositoryRoot = decodeURIComponent(new URL('.', import.meta.url).pathname);

export default defineConfig(({ command }) => ({
  root: repositoryRoot,
  base: command === 'build' ? '/galactic_empires/' : '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/.codex-worktrees/**'],
  },
}));
