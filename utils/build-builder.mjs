import { esbuild } from './build.mjs';

await esbuild({
  bundle: true,
  external: ['@vercel/build-utils', '@vercel/nft'],
});
