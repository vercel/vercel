import npa from 'npm-package-arg';
import { PackageJson } from '@vercel/build-utils';

export function getBuildersToAdd(
  builders: Iterable<npa.Result>,
  pkg?: PackageJson | null
): Set<string> {
  const deps = {
    ...pkg?.dependencies,
    ...pkg?.devDependencies,
  };
  const buildersToAdd = new Set<string>();

  for (const parsed of builders) {
    if (parsed.type === 'remote') {
      // A URL always needs to be added since the content may have changed
      buildersToAdd.add(parsed.rawSpec);
      continue;
    }

    if (typeof parsed.name !== 'string') continue;

    // `@vercel/static` is a special-case built-in Builder,
    // so it doesn't get added to `package.json`
    if (parsed.name === '@vercel/static') continue;

    if (parsed.type === 'version') {
      // If a specific version was specified then make sure the
      // version in `package.json` matches, otherwise add
      if (deps[parsed.name] !== parsed.rawSpec) {
        buildersToAdd.add(parsed.raw);
      }
      continue;
    }

    // TODO: add semver parsing when tag is present
    if (!deps[parsed.name]) {
      buildersToAdd.add(parsed.raw);
    }
  }

  // `@vercel/build-utils` is an implicit dependency for
  // all Builders, so it needs to be present as well
  if (!deps['@vercel/build-utils']) {
    buildersToAdd.add('@vercel/build-utils');
  }

  return buildersToAdd;
}
