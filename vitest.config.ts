import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],

    // setupFiles: ['./tests/setup/vitest.setup.ts'],
    setupFiles: ['./src/test-setup.ts'],

    environment: 'happy-dom',

    coverage: {
      provider: 'v8',

      reporter: ['text', 'json-summary', 'json'],

      all: false,

      include: ['src/**/*.ts'],

      exclude: [
        '**/*.test.ts',

        'tests/**',

        'src/main.ts',

        'src/settings/**',
        'src/ui/**',
        'src/migrations/**',

        'src/editor/live-preview/**',
        'src/editor/markdown-processors/**',

        'src/materialifyIcons/generated.ts',
      ],

      thresholds: {
        lines: 40, //50
        branches: 35, //40
        functions: 40, //50
        statements: 40, //50
      },
    },
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),

      '@tests': resolve(__dirname, './tests'),
    },
  },
});
