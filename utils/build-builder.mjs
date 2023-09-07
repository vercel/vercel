/**
 * This script is the build configuration common to all our Builder packages.
 * We bundle the output using `esbuild`, and do not publish type definitions.
 * 
 * `@vercel/build-utils` is marked as external because it's always an implicit
 * dependency when the Builder is invoked by `vercel build`.
 * 
 * `@vercel/nft` is marked as external because esbuild has trouble bundling
 * it due to some optional dependencies which we don't install, but also this
 * is beneficial because the package will be de-duped at the node_modules level
 * between the Builders which share this dependency.
 */
import { esbuild } from './build.mjs';

await esbuild({
  bundle: true,
  external: ['@vercel/build-utils', '@vercel/nft'],
});
