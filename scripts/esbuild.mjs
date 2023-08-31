import { join } from 'path';
import { globSync } from 'glob';
import { build } from 'esbuild';

const cwd = process.cwd();
const dist = join(cwd, 'dist');
const pattern = join(cwd, 'src/**/*.{js,ts}');
const files = globSync(pattern);
console.log({ files, dist });

await build({
  entryPoints: files,
  format: 'cjs',
  outdir: dist,
  platform: 'node',
  target: 'es2021',
  sourcemap: true,
});
