import { esbuild } from '../../utils/build.mjs';

await esbuild({ bundle: true, external: ['@vercel/build-utils'] });
