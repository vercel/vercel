import { tsc, esbuild } from '../../utils/build.js';

// await Promise.all([tsc(), esbuild().then(() => esbuild({ bundle: true }))]);
await Promise.all([tsc(), esbuild()]);
