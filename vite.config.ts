import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // GitHub Pages hosts this project beneath /galactic_empires/. Keep the
  // development server at / so the familiar localhost URL still works.
  base: command === 'build' ? '/galactic_empires/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
}));
