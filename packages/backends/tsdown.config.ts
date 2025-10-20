import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: 'src/index.ts',
  },
  {
    entry: 'src/introspection/loaders/cjs.ts',
    outDir: 'dist/loaders',
    format: 'cjs',
  },
  {
    entry: 'src/introspection/loaders/esm.ts',
    outDir: 'dist/loaders',
    format: 'esm',
  },
  {
    entry: 'src/introspection/loaders/hooks.ts',
    outDir: 'dist/loaders',
    format: 'esm',
  },
  {
    entry: 'src/introspection/express/handle.ts',
    outDir: 'dist/express',
    format: 'esm',
  },
  {
    entry: 'src/introspection/hono/handle.ts',
    outDir: 'dist/hono',
    format: 'esm',
  },
]);
