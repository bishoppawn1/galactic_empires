import { defineConfig } from 'vite';
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
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
    },
}));
