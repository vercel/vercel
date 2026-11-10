import type { ServiceRuntime } from '@vercel/build-utils';

export const RUNTIME_BUILDERS: Record<ServiceRuntime, string> = {
  node: '@vercel/backends',
  python: '@vercel/python',
  go: '@vercel/go',
  rust: '@vercel/rust',
  ruby: '@vercel/ruby',
  container: '@vercel/container',
};

export const RUNTIME_MANIFESTS: Partial<Record<ServiceRuntime, string[]>> = {
  node: ['package.json'],
  python: [
    'pyproject.toml',
    'requirements.txt',
    'Pipfile',
    'pylock.yml',
    'uv.lock',
    'setup.py',
  ],
  go: ['go.mod'],
  ruby: ['Gemfile'],
  rust: ['Cargo.toml'],
};

export const ENTRYPOINT_EXTENSIONS: Record<string, ServiceRuntime> = {
  '.ts': 'node',
  '.mts': 'node',
  '.js': 'node',
  '.mjs': 'node',
  '.cjs': 'node',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.ru': 'ruby',
};

/**
 * Builders that produce static output (SPAs, static sites) with no runtime.
 */
export const STATIC_BUILDERS = new Set([
  '@vercel/static-build',
  '@vercel/static',
]);

/**
 * Builders that produce their own full route table with handle phases
 * (filesystem, miss, rewrite, hit, error) and should not receive synthetic
 * catch-all routes from the caller.
 */
export const ROUTE_OWNING_BUILDERS = new Set([
  '@vercel/next',
  '@vercel/backends',
]);

/**
 * Blessed Dockerfile/Containerfile names for container services.
 * Ordered so `.vercel` opt-in markers take precedence during auto-detection.
 */
export const CONTAINER_ENTRYPOINT_CANDIDATES = [
  'Dockerfile.vercel',
  'Containerfile.vercel',
  'Dockerfile',
  'Containerfile',
] as const;
