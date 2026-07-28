import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCommandModel, visibleCommands } from './load-command-model.js';
import { GENERATED_INDEX } from './generate.js';
import {
  generatedDir,
  REPAIR_COMMAND,
  referencesDir,
  repoRoot,
} from './paths.js';
import { assertGeneratedContentSafe, renderIndex } from './render-markdown.js';
import { validateSkillExamples } from './validate-examples.js';

/**
 * Every handwritten reference must point at its `--help` source of truth.
 * (`global-options.md` points at root `vercel --help`.)
 */
const EXACT_SYNTAX_RE = /^> Exact syntax: .*`(?:vercel|vc)\b[^`]*--help`/;

async function checkReferencePointers(): Promise<string[]> {
  const errors: string[] = [];
  const entries = await readdir(referencesDir);
  for (const entry of entries.filter(name => name.endsWith('.md')).sort()) {
    const content = await readFile(join(referencesDir, entry), 'utf8');
    const pointer = content.split('\n')[2] ?? '';
    if (!EXACT_SYNTAX_RE.test(pointer)) {
      errors.push(
        `references/${entry}: line 3 must be a \`> Exact syntax: \` pointer naming at least one \`vercel <command> --help\``
      );
    }
  }
  return errors;
}

export async function checkSkillReference(): Promise<string[]> {
  const errors: string[] = [];
  const manifest = await loadCommandModel();
  const index = renderIndex(manifest);

  try {
    assertGeneratedContentSafe(index, [repoRoot]);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const roots = visibleCommands(manifest.commands).filter(
    c => c.path.length === 1
  );
  for (const root of roots) {
    if (!index.includes(`| \`${root.name}\` |`)) {
      errors.push(`Root family missing from generated index: ${root.name}`);
    }
  }

  // Committed output must match a fresh render byte-for-byte, and nothing
  // else may live under generated/.
  try {
    const committedFiles = (await readdir(generatedDir)).sort();
    for (const file of committedFiles) {
      if (file !== GENERATED_INDEX) {
        errors.push(`Unexpected generated file: ${file}`);
      }
    }
    if (!committedFiles.includes(GENERATED_INDEX)) {
      errors.push(`Missing generated file: ${GENERATED_INDEX}`);
    } else {
      const committed = await readFile(
        join(generatedDir, GENERATED_INDEX),
        'utf8'
      );
      if (committed !== index) {
        errors.push(`Stale generated file: ${GENERATED_INDEX}`);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      errors.push('Missing skills/vercel-cli/generated/ directory');
    } else {
      throw error;
    }
  }

  errors.push(...(await checkReferencePointers()));

  const exampleFailures = await validateSkillExamples(manifest);
  for (const failure of exampleFailures) {
    const loc =
      failure.line > 0 ? `${failure.file}:${failure.line}` : failure.file;
    errors.push(`${loc}: ${failure.message} (example: ${failure.raw})`);
  }

  return errors;
}

async function main(): Promise<void> {
  const errors = await checkSkillReference();
  if (errors.length === 0) {
    process.stdout.write('skills/vercel-cli check passed\n');
    return;
  }

  process.stderr.write('skills/vercel-cli check failed:\n');
  for (const error of errors) {
    process.stderr.write(`  - ${error}\n`);
  }
  process.stderr.write(`\nRepair by running:\n  ${REPAIR_COMMAND}\n`);
  process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('check.ts') ||
    process.argv[1].endsWith('check.js'));

if (isMain) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
