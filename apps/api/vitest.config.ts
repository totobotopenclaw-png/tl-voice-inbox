import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks', // Run tests in separate processes to avoid DB conflicts
    poolOptions: {
      forks: {
        singleFork: true, // Run sequentially
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        'scripts/',
      ],
    },
  },
  resolve: {
    alias: {
      '@db': './src/db',
      '@routes': './src/routes',
      '@workers': './src/workers',
      '@services': './src/services',
      '@queue': './src/queue',
      '@llm': './src/llm',
    },
  },
});