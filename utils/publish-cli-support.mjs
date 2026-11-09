// Build @vercel/cli-support from the packed `vercel` tarball.
//
// @vercel/cli-support is the packed `vercel` tarball (dist/ and runtime
// dependencies) under another name, restricted to operating systems without a
// native binary. It is an optionalDependency of `vercel` (see
// utils/inject-native-optional-deps.mjs), and vc.js loads it when its own
// ./index.js cannot be loaded.

export const cliSupportName = '@vercel/cli-support';

// Every OS in NATIVE_TARGETS in packages/cli/src/vc.js.
export const cliSupportOs = ['!darwin', '!linux'];

/**
 * @param {Record<string, unknown>} vercelPkg packed `vercel` package.json
 */
export function cliSupportPackageJson(vercelPkg) {
  // A second owner of the `vercel` bin makes npm skip linking it for
  // `vercel` on hosts where this optional dependency is not installed.
  const {
    bin: _bin,
    scripts: _scripts,
    optionalDependencies: _optionalDependencies,
    ...pkg
  } = vercelPkg;
  return {
    ...pkg,
    name: cliSupportName,
    description:
      'The JavaScript Vercel CLI, installed by `vercel` where no native binary is available',
    os: cliSupportOs,
  };
}
