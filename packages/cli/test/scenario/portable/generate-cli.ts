/**
 * Exports the generated artifacts as canonical JSON for runners that cannot
 * read the Zod sources (for example the Go port). Nothing in this repository
 * reads the output; the TS runner builds the same artifacts in memory.
 *
 *   pnpm scenarios:generate [outDir]
 *
 * `outDir` defaults to `test/scenario/portable/generated` (gitignored). The
 * directory is replaced wholesale, so it must be empty, missing, or a
 * previous export (identified by its `manifest.json` generator field).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateArtifacts } from './generate';
import { GENERATOR } from './model/schemas';

const defaultOutDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'generated'
);
const outDir = resolve(process.argv[2] ?? defaultOutDir);

function isPreviousExport(dir: string): boolean {
  try {
    const manifest = JSON.parse(
      readFileSync(join(dir, 'manifest.json'), 'utf8')
    );
    return manifest?.generator === GENERATOR;
  } catch {
    return false;
  }
}

if (existsSync(outDir) && readdirSync(outDir).length > 0) {
  if (!isPreviousExport(outDir)) {
    process.stderr.write(
      `Refusing to overwrite ${outDir}: not empty and not a previous scenario export.\n`
    );
    process.exit(1);
  }
  rmSync(outDir, { recursive: true });
}

const artifacts = generateArtifacts();
for (const [path, content] of artifacts) {
  const target = join(outDir, ...path.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

process.stdout.write(
  `Exported ${artifacts.size} files to ${relative(process.cwd(), outDir) || '.'}.\n`
);
