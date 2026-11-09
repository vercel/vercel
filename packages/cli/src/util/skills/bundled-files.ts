import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CLI_SKILL_NAME = 'vercel-cli';

export interface BundledSkillFile {
  /** POSIX path relative to the skill directory, such as `references/ci.md`. */
  path: string;
  content: string;
}

export interface BundledSkill {
  name: string;
  files: BundledSkillFile[];
}

/**
 * The `vercel-cli` agent skill that ships with this CLI version, from the
 * repository's `skills/vercel-cli` directory.
 *
 * `scripts/bundle-skills.mjs` replaces this module at build time with one that
 * inlines the same files, so an installed CLI carries the skill written for its
 * own version. Running from source reads the checkout instead.
 */
export function readBundledCliSkill(): BundledSkill {
  return readSkillDirectory(
    join(__dirname, '../../../../../skills'),
    CLI_SKILL_NAME
  );
}

/** Reads `<root>/<name>/`, which must hold a `SKILL.md`. */
export function readSkillDirectory(root: string, name: string): BundledSkill {
  const files = readFilesRecursive(join(root, name), '');
  if (!files.some(file => file.path === 'SKILL.md')) {
    throw new Error(`No SKILL.md in ${join(root, name)}`);
  }
  return { name, files };
}

function readFilesRecursive(dir: string, prefix: string): BundledSkillFile[] {
  const files: BundledSkillFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...readFilesRecursive(join(dir, entry.name), path));
    } else if (entry.isFile()) {
      files.push({
        path,
        content: readFileSync(join(dir, entry.name), 'utf8'),
      });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
