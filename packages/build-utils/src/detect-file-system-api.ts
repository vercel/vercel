import semver from 'semver';
import { isOfficialRuntime } from './';
import type { DetectorFilesystem } from './detectors/filesystem';
import type {
  Builder,
  BuilderFunctions,
  PackageJson,
  ProjectSettings,
} from './types';

const enableFileSystemApiFrameworks = new Set(['solidstart']);

/**
 * If the Deployment can be built with the new File System API,
 * we'll return the new Builder here, otherwise return `null`.
 */
export async function detectFileSystemAPI({
  vfs,
  projectSettings,
  builders,
  functions,
  pkg,
  tag = '',
  enableFlag = false,
}: {
  vfs: DetectorFilesystem;
  projectSettings: ProjectSettings;
  builders: Builder[];
  functions: BuilderFunctions | undefined;
  pkg: PackageJson | null | undefined;
  tag?: string;
  enableFlag?: boolean;
}) {
  const framework = projectSettings.framework || '';
  const hasDotOutput = vfs.hasPath('.output');
  const hasMiddleware =
    vfs.isFile('_middleware.js') || vfs.isFile('_middleware.ts');

  const isEnabled =
    enableFlag ||
    hasMiddleware ||
    hasDotOutput ||
    enableFileSystemApiFrameworks.has(framework);
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

  if (framework === 'nextjs' && !hasDotOutput) {
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
  const withTag = tag ? `@${tag}` : '';

  return {
    use: `@vercelruntimes/file-system-api${withTag}`,
    src: '**',
    config: {
      ...config,
      fileSystemAPI: true,
      framework: config.framework || framework || null,
      projectSettings: projectSettings,
      hasMiddleware,
      hasDotOutput,
    },
  };
}
