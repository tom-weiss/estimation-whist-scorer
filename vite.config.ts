import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repositoryName = 'estimation-whist-scorer';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? `/${repositoryName}/` : '/',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
}));
