import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: 'src/index.ts',
    outDir: 'dist',
    format: 'esm',
    dts: true,
  },
  {
    entry: 'src/loaders/cjs.ts',
    outDir: 'dist/loaders',
    format: 'cjs',
  },
  {
    entry: 'src/loaders/esm.ts',
    outDir: 'dist/loaders',
    format: 'esm',
  },
  {
    entry: 'src/loaders/hooks.ts',
    outDir: 'dist/loaders',
    format: 'esm',
  },
  {
    entry: 'src/express.ts',
    outDir: 'dist',
    format: 'esm',
  },
  {
    entry: 'src/hono.ts',
    outDir: 'dist',
    format: 'esm',
  },
]);
