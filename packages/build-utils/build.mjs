import { tsc, esbuild } from '../../utils/build.mjs';

await Promise.all([
  tsc(),
  esbuild().then(() =>
    esbuild({
      bundle: true,
      // Keep @vercel/python-analysis external because its WASM module uses
      // require.resolve.
      external: ['@vercel/python-analysis'],
    })
  ),
]);
