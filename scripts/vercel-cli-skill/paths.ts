import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Repository root (parent of `scripts/`). */
export const repoRoot = join(here, '..', '..');

export const cliPackageDir = join(repoRoot, 'packages', 'cli');
export const cliCommandsDir = join(cliPackageDir, 'src', 'commands');
export const cliCommandsIndex = join(cliCommandsDir, 'index.ts');
export const cliArgCommon = join(cliPackageDir, 'src', 'util', 'arg-common.ts');

export const skillDir = join(repoRoot, 'skills', 'vercel-cli');
export const generatedDir = join(skillDir, 'generated');
export const validationExceptionsPath = join(
  skillDir,
  'validation-exceptions.json'
);

export const referencesDir = join(skillDir, 'references');

export const REPAIR_COMMAND = 'pnpm skills:vercel-cli:generate';
