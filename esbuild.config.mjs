import esbuild from 'esbuild';
import process from 'process';

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/tree',
    'child_process',
  ],
  format: 'cjs',
  target: 'es2022',
  logLevel: 'info',
  sourcemap: 'inline',
  treeShaking: true,
  outfile: 'main.js',
});

await context.rebuild();
process.exit(0);
