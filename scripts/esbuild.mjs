import { posix } from 'path';
import { globSync } from 'glob';
import { build } from 'esbuild';

const cwd = process.cwd();
const dist = posix.join(cwd, 'dist');
const pattern = posix.join(cwd, 'src/**/*.{js,ts}');
const files = globSync(pattern);

await build({
  entryPoints: files,
  bundle: process.argv.includes('--bundle'),
  format: 'cjs',
  outdir: dist,
  platform: 'node',
  target: 'es2021',
  sourcemap: true,
});
