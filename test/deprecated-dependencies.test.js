const fs = require('fs');
const path = require('path');

/**
 * This test ensures we catch deprecated subdependencies in the lockfile.
 * When a dependency is deprecated, it should be reviewed and either:
 * 1. Updated to a non-deprecated version
 * 2. Added to the allowlist with a comment explaining why
 */

// Allowlist of deprecated packages that are acceptable for now.
// Each entry should have a comment explaining why it's acceptable.
const DEPRECATED_ALLOWLIST = {
  // ESLint 8.x is deprecated but migration to 9.x requires significant effort
  '@humanwhocodes/config-array':
    'ESLint 8.x dependency, will be removed when migrating to ESLint 9',
  '@humanwhocodes/object-schema':
    'ESLint 8.x dependency, will be removed when migrating to ESLint 9',
  eslint: 'Monorepo uses ESLint 8.x, migration to 9.x planned',

  // Glob 7.x/8.x deprecation
  glob: 'Transitive dependency, will be updated when upstream packages migrate',

  // Other known acceptable deprecations
  inflight:
    'Transitive dependency from glob, will be removed when glob is updated',
  rimraf: 'Used for compatibility, migration to newer version planned',
  querystring: 'Legacy API, but still functional for current use cases',
  '@types/find-up': 'Stub types, no runtime impact',
  '@types/resolve-from': 'Stub types, no runtime impact',
  'create-svelte': 'Dev dependency for testing, migration to sv planned',
  osenv: 'Transitive dependency, will be removed when upstream packages update',
  argv: 'Transitive dependency, no direct usage',
};

/**
 * Parse deprecated packages from pnpm-lock.yaml
 * Looks for patterns like:
 *   /package@version:
 *     ...
 *     deprecated: message
 */
function parseDeprecatedPackages(lockfileContent) {
  const deprecated = [];
  const lines = lockfileContent.split('\n');

  let currentPackage = null;
  let currentVersion = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match package entries like "  /tar@6.2.1:" or "  /@scope/pkg@1.0.0:"
    const pkgMatch = line.match(/^\s{2}\/(.+)@([^@:]+):$/);
    if (pkgMatch) {
      currentPackage = pkgMatch[1];
      currentVersion = pkgMatch[2];
      continue;
    }

    // Match deprecated field
    const deprecatedMatch = line.match(/^\s{4}deprecated:\s*(.+)$/);
    if (deprecatedMatch && currentPackage) {
      deprecated.push({
        name: currentPackage,
        version: currentVersion,
        message: deprecatedMatch[1],
      });
      currentPackage = null;
      currentVersion = null;
    }

    // Reset on new top-level entry (not indented or different indent level)
    if (!line.startsWith('    ') && !line.startsWith('  /')) {
      currentPackage = null;
      currentVersion = null;
    }
  }

  return deprecated;
}

describe('Deprecated Dependencies', () => {
  let deprecatedPackages;

  beforeAll(() => {
    const lockfilePath = path.join(__dirname, '..', 'pnpm-lock.yaml');
    const lockfileContent = fs.readFileSync(lockfilePath, 'utf8');
    deprecatedPackages = parseDeprecatedPackages(lockfileContent);
  });

  it('should not have new deprecated subdependencies', () => {
    const newDeprecated = deprecatedPackages.filter(pkg => {
      // Check if it's in the allowlist (by package name)
      return !DEPRECATED_ALLOWLIST[pkg.name];
    });

    const allowedCount = deprecatedPackages.length - newDeprecated.length;

    // eslint-disable-next-line no-console
    console.log(
      `Deprecated packages: ${deprecatedPackages.length} total, ${allowedCount} in allowlist`
    );

    if (newDeprecated.length > 0) {
      const message = newDeprecated
        .map(pkg => `  - ${pkg.name}@${pkg.version}: ${pkg.message}`)
        .join('\n');

      throw new Error(
        `Found ${newDeprecated.length} new deprecated subdependency(s) not in allowlist:\n${message}\n\n` +
          'To fix this:\n' +
          '1. Update the dependency to a non-deprecated version, or\n' +
          '2. Add it to DEPRECATED_ALLOWLIST in test/deprecated-dependencies.test.js with a justification'
      );
    }
  });
});
