import { esbuild, getDependencies, tsc } from '../../utils/build.mjs';

await Promise.all([tsc(), esbuild()]);

await esbuild({
  entryPoints: ['src/detect-builders.ts'],
  bundle: true,
  external: getDependencies(),
});
