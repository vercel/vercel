import { dirname, isAbsolute, relative, sep } from 'path';
import { getVercelIgnore, type VercelConfig } from '@vercel/client';
import type { ProjectSettings } from '@vercel-internals/types';

export const singleFileConfig = {
  framework: null,
  buildCommand: '',
  installCommand: '',
  // `null` overrides a linked project's output directory like '.' does, but
  // '.' keeps the API from serving static files without a build.
  outputDirectory: null,
} satisfies VercelConfig;

// Apply these per deployment so a linked project's framework, root directory,
// or build commands cannot turn an explicitly selected file into an app build.
export const singleFileProjectSettings = {
  ...singleFileConfig,
  rootDirectory: null,
} satisfies ProjectSettings;

/**
 * Whether a directory deployment would leave the file out, either from the
 * file's own directory or from `cwd` when the file is inside it. Ignored files
 * (`.env.local`, `.git`, `.vercelignore` entries) are often secrets, and a
 * single-file deployment would serve them publicly.
 */
export async function isIgnoredFile(
  file: string,
  cwd: string
): Promise<boolean> {
  const roots = new Set([dirname(file)]);
  const fromCwd = relative(cwd, file);
  if (fromCwd && !fromCwd.startsWith(`..${sep}`) && !isAbsolute(fromCwd)) {
    roots.add(cwd);
  }
  for (const root of roots) {
    const { ig } = await getVercelIgnore(root);
    if (ig.ignores(relative(root, file).split(sep).join('/'))) return true;
  }
  return false;
}
