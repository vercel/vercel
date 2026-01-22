export const COMMON_IGNORED_DIRECTORIES = new Set([
  // Version control
  '.git',
  '.svn',
  '.hg',

  // Dependencies
  'node_modules',
  'vendor',
  '.bundle',

  // Python environments and caches
  '.venv',
  'venv',
  'env',
  '.env',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',

  // Build outputs
  'dist',
  'build',
  'out',
  'target', // Rust
  'pkg', // Go

  // Framework-specific caches and outputs
  '.vercel',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',

  // Other
  'coverage',
  '.turbo',
  '.cache',
]);
