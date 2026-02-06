import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: 'src/index.ts',
    dts: true,
  },
  // Introspection loaders
  {
    entry: 'src/rolldown/index.ts',
    outDir: 'dist/rolldown',
    format: 'esm',
  },
  {
    entry: 'src/rolldown/esm.ts',
    outDir: 'dist/rolldown',
    format: 'esm',
  },
  {
    entry: 'src/rolldown/hooks.ts',
    outDir: 'dist/rolldown',
    format: 'esm',
  },
  {
    entry: 'src/rolldown/cjs-hooks.ts',
    outDir: 'dist/rolldown',
    format: 'cjs',
  },
  {
    entry: 'src/introspection/loaders/cjs.ts',
    outDir: 'dist/introspection/loaders',
    format: 'cjs',
  },
  {
    entry: 'src/introspection/loaders/esm.ts',
    outDir: 'dist/introspection/loaders',
    format: 'esm',
  },
  {
    entry: 'src/introspection/loaders/hooks.ts',
    outDir: 'dist/introspection/loaders',
    format: 'esm',
  },
  {
    entry: 'src/introspection/loaders/rolldown-esm.ts',
    outDir: 'dist/introspection/loaders',
    format: 'esm',
  },
  {
    entry: 'src/introspection/loaders/rolldown-hooks.ts',
    outDir: 'dist/introspection/loaders',
    format: 'esm',
  },
  // Introspection framework handlers (needed by loaders at runtime)
  {
    entry: 'src/introspection/express.ts',
    outDir: 'dist/introspection',
    format: 'esm',
  },
  {
    entry: 'src/introspection/hono.ts',
    outDir: 'dist/introspection',
    format: 'esm',
  },
]);
