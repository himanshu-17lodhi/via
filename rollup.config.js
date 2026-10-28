import { fileURLToPath } from 'url';
import path from 'path';

import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import alias from '@rollup/plugin-alias';
import copy from 'rollup-plugin-copy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.BUILD === 'production';

const obsidianExportPath = process.env.DEST || './dist';

export default {
  input: './src/main.ts',
  output: {
    file: path.join(obsidianExportPath, 'main.js'),
    sourcemap: 'inline',
    sourcemapExcludeSources: isProd,
    format: 'cjs',
    exports: 'default',
  },
  external: ['obsidian'],
  plugins: [
    alias({
      entries: [
        {
          find: '@',
          replacement: path.resolve(__dirname, 'src'),
        },
      ],
    }),
    typescript({
      tsconfig: './tsconfig.json',
    }),
    nodeResolve({ browser: true }),
    commonjs(),
    copy({
      targets: [{ src: './manifest.json', dest: obsidianExportPath }],
      hook: 'writeBundle',
    }),
    {
      name: 'build-summary',
      writeBundle() {
        console.log(
          `\nBuild output:\n  ✓ main.js\n  ✓ manifest.json\n  → ${obsidianExportPath}\n`,
        );
      },
    },
  ],
  onwarn: (warning) => {
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    console.warn(warning.message);
  },
};
