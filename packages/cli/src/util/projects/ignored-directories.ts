/**
 * Directory names never worth descending into when looking for project roots.
 *
 * Name-based so the check stays cheap at every level of a walk. Shared by the
 * root-directory prompt and repo-wide framework detection so the two always
 * agree on which directories exist as far as the user is concerned.
 */
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'bower_components',
  'jspm_packages',
  'dist',
  'build',
  'out',
  'coverage',
  'target',
  'vendor',
  'tmp',
  'temp',
  'venv',
  '__pycache__',
]);

export function isIgnoredDirectory(name: string): boolean {
  // Dotfiles cover `.git`, `.vercel`, `.next`, `.venv`, `.turbo`, and friends.
  return name.startsWith('.') || IGNORED_DIRECTORIES.has(name);
}
