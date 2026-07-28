import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCommandModel } from './load-command-model.js';
import { generatedDir, repoRoot } from './paths.js';
import { assertGeneratedContentSafe, renderIndex } from './render-markdown.js';

export const GENERATED_INDEX = 'index.md';

export async function generateSkillReference(
  outDir: string = generatedDir
): Promise<string> {
  const manifest = await loadCommandModel();
  const index = renderIndex(manifest);

  assertGeneratedContentSafe(index, [repoRoot]);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, GENERATED_INDEX), index, 'utf8');

  return GENERATED_INDEX;
}

async function main(): Promise<void> {
  const written = await generateSkillReference();
  process.stdout.write(`Wrote ${written} to skills/vercel-cli/generated/\n`);
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('generate.ts') ||
    process.argv[1].endsWith('generate.js'));

if (isMain) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
