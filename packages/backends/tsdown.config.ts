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
    entry: 'src/introspection/express/capture-express-app.ts',
    outDir: 'dist/introspection/express',
    format: 'esm',
  },
  {
    entry: 'src/introspection/hono/capture-hono-app.ts',
    outDir: 'dist/introspection/hono',
    format: 'esm',
  },
]);
