import { join } from 'path';
import { globSync } from 'glob';
import { build } from 'esbuild';

const cwd = process.cwd();
const dist = join(cwd, 'dist');
const pattern = join(cwd, 'src/**/*.{js,ts}');
const files = globSync(pattern);

await build({
  entryPoints: files,
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  outdir: dist,
});
