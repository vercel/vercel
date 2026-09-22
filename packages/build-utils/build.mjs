import { rm } from 'node:fs/promises';
import { tsc, esbuild } from '../../utils/build.mjs';

await rm(new URL('./dist', import.meta.url), { recursive: true, force: true });
await Promise.all([tsc(), esbuild().then(() => esbuild({ bundle: true }))]);
