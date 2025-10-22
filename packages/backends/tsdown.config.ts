import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: 'src/index.ts',
    dts: true,
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
    entry: 'src/introspection/express.ts',
    outDir: 'dist',
    format: 'esm',
  },
  {
    entry: 'src/introspection/hono.ts',
    outDir: 'dist',
    format: 'esm',
  },
]);
