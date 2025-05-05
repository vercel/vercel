import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/next/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
