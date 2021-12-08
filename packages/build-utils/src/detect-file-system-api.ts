import semver from 'semver';
import { isOfficialRuntime } from './';
import {
  Builder,
  BuilderFunctions,
  Files,
  PackageJson,
  ProjectSettings,
} from './types';

const enableFileSystemApiFrameworks = new Set(['solidstart']);

/**
 * If the Deployment can be built with the new File System API,
 * we'll return the new Builder here, otherwise return `null`.
 */
export async function detectFileSystemAPI({
  framework,
  files,
  builders,
  functions,
  pkg,
  projectSettings,
  enableFlag,
}: {
  framework: string;
  files: Files;
  builders: Builder[];
  functions: BuilderFunctions | undefined;
  pkg: PackageJson | null | undefined;
  projectSettings: ProjectSettings;
  enableFlag?: boolean;
}) {
  const isEnabled = Boolean(
    enableFlag ||
      hasMiddleware(files) ||
      hasDotOutput(files) ||
      enableFileSystemApiFrameworks.has(framework)
  );

  if (!isEnabled) {
    return null;
  }

  if (
    process.env.HUGO_VERSION ||
    process.env.ZOLA_VERSION ||
    process.env.GUTENBERG_VERSION ||
    Object.values(functions || {}).some(fn => !!fn.runtime)
  ) {
    return null;
  }

  const deps = Object.assign({}, pkg?.dependencies, pkg?.devDependencies);

  const allBuildersSupported = builders.every(
    ({ use }) =>
      // Some builders must use a corresponding CLI plugin
      (isOfficialRuntime('go', use) && 'vercel-plugin-go' in deps) ||
      (isOfficialRuntime('ruby', use) && 'vercel-plugin-ruby' in deps) ||
      (isOfficialRuntime('python', use) && 'vercel-plugin-python' in deps) ||
      isOfficialRuntime('node', use) ||
      isOfficialRuntime('next', use) ||
      isOfficialRuntime('static', use) ||
      isOfficialRuntime('static-build', use)
  );

  if (!allBuildersSupported) {
    return null;
  }

  if (
    framework === 'nuxtjs' ||
    framework === 'sveltekit' ||
    framework === 'redwoodjs'
  ) {
    return null;
  }

  if (framework === 'nextjs' && !hasDotOutput(files)) {
    // Use the old pipeline if a custom output directory was specified for Next.js
    // because `vercel build` cannot ensure that the directory will be in the same
    // location as `.output`, which can break imports (not just nft.json files).
    if (projectSettings?.outputDirectory) {
      return null;
    }
    const versionRange = deps['next'];
    if (!versionRange) {
      return null;
    }

    // TODO: We'll need to check the lockfile if one is present.
    if (versionRange !== 'latest' && versionRange !== 'canary') {
      const fixedVersion = semver.valid(semver.coerce(versionRange) || '');

      if (!fixedVersion || !semver.gte(fixedVersion, '12.0.0')) {
        return null;
      }
    }
  }

  const frontendBuilder = builders.find(
    ({ use }) =>
      isOfficialRuntime('next', use) ||
      isOfficialRuntime('static', use) ||
      isOfficialRuntime('static-build', use)
  );
  const config = frontendBuilder?.config || {};

  // Use either `package.json` or the first file it finds.
  const src =
    (files['package.json'] ? 'package.json' : Object.keys(files)[0]) || '**';

  return {
    use: '@vercelruntimes/file-system-api@canary',
    src,
    config: {
      ...config,
      fileSystemAPI: true,
      framework: config.framework || framework || null,
      projectSettings: projectSettings,
      hasMiddleware: hasMiddleware(files),
      hasDotOutput: hasDotOutput(files),
    },
  };
}

export function hasMiddleware(files: Files) {
  return Boolean(files['_middleware.js'] || files['_middleware.ts']);
}

export function hasDotOutput(files: Files) {
  return Object.keys(files).some(file => file.startsWith('.output/'));
}
