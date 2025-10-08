import semver from 'semver';
import { isOfficialRuntime } from './';
import type {
  Builder,
  BuilderFunctions,
  PackageJson,
  ProjectSettings,
} from '@vercel/build-utils';

interface Metadata {
  plugins: string[];
  hasDotOutput: boolean;
  hasMiddleware: boolean;
}

/**
 * If the Deployment can be built with the new File System API,
 * return the new Builder. Otherwise an "Exclusion Condition"
 * was hit so return `null` builder with a `reason` for exclusion.
 */
export async function detectFileSystemAPI({
  files,
  projectSettings,
  builders,
  vercelConfig,
  pkg,
  tag,
  enableFlag = false,
}: {
  files: { [relPath: string]: any };
  projectSettings: ProjectSettings;
  builders: Builder[];
  vercelConfig:
    | { builds?: Builder[]; functions?: BuilderFunctions }
    | null
    | undefined;
  pkg: PackageJson | null | undefined;
  tag: string | undefined;
  enableFlag: boolean | undefined;
}): Promise<
  | { metadata: Metadata; fsApiBuilder: Builder; reason: null }
  | { metadata: Metadata; fsApiBuilder: null; reason: string }
> {
  const framework = projectSettings.framework || '';
  const deps = Object.assign({}, pkg?.dependencies, pkg?.devDependencies);
  const plugins = Object.keys(deps).filter(dep =>
    dep.startsWith('vercel-plugin-')
  );
  const hasDotOutput = Object.keys(files).some(file =>
    file.startsWith('.output/')
  );
  const hasMiddleware = Boolean(
    files['_middleware.js'] || files['_middleware.ts']
  );

  const metadata: Metadata = {
    plugins,
    hasDotOutput,
    hasMiddleware,
  };

  const isEnabled = enableFlag || hasMiddleware || hasDotOutput;
  if (!isEnabled) {
    return { metadata, fsApiBuilder: null, reason: 'Flag not enabled.' };
  }

  if (vercelConfig?.builds && vercelConfig.builds.length > 0) {
    return {
      metadata,
      fsApiBuilder: null,
      reason:
        'Detected `builds` in vercel.json. Please remove it in favor of CLI plugins.',
    };
  }

  if (Object.values(vercelConfig?.functions || {}).some(fn => !!fn.runtime)) {
    return {
      metadata,
      fsApiBuilder: null,
      reason:
        'Detected `functions.runtime` in vercel.json. Please remove it in favor of CLI plugins.',
    };
  }

  if (process.env.HUGO_VERSION) {
    return {
      metadata,
      fsApiBuilder: null,
      reason: 'Detected `HUGO_VERSION` environment variable. Please remove it.',
    };
  }

  if (process.env.ZOLA_VERSION) {
    return {
      metadata,
      fsApiBuilder: null,
      reason: 'Detected `ZOLA_VERSION` environment variable. Please remove it.',
    };
  }

  if (process.env.GUTENBERG_VERSION) {
    return {
      metadata,
      fsApiBuilder: null,
      reason:
        'Detected `GUTENBERG_VERSION` environment variable. Please remove it.',
    };
  }

  const invalidBuilder = builders.find(({ use }) => {
    const valid =
      isOfficialRuntime('go', use) ||
      isOfficialRuntime('python', use) ||
      isOfficialRuntime('ruby', use) ||
      isOfficialRuntime('node', use) ||
      isOfficialRuntime('next', use) ||
      isOfficialRuntime('static', use) ||
      isOfficialRuntime('static-build', use);
    return !valid;
  });

  if (invalidBuilder) {
    return {
      metadata,
      fsApiBuilder: null,
      reason: `Detected \`${invalidBuilder.use}\` in vercel.json. Please remove it in favor of CLI plugins.`,
    };
  }

  for (const lang of ['go', 'python', 'ruby']) {
    for (const { use } of builders) {
      const plugin = 'vercel-plugin-' + lang;
      if (isOfficialRuntime(lang, use) && !deps[plugin]) {
        return {
          metadata,
          fsApiBuilder: null,
          reason: `Detected \`${lang}\` Serverless Function usage without plugin \`${plugin}\`. Please run \`npm i ${plugin}\`.`,
        };
      }
    }
  }

  if (
    framework === 'nuxtjs' ||
    framework === 'sveltekit' ||
    framework === 'redwoodjs'
  ) {
    return {
      metadata,
      fsApiBuilder: null,
      reason: `Detected framework \`${framework}\` that only supports legacy File System API. Please contact the framework author.`,
    };
  }

  if (framework === 'nextjs' && !hasDotOutput) {
    // Use the old pipeline if a custom output directory was specified for Next.js
    // because `vercel build` cannot ensure that the directory will be in the same
    // location as `.output`, which can break imports (not just nft.json files).
    if (projectSettings?.outputDirectory) {
      return {
        metadata,
        fsApiBuilder: null,
        reason: `Detected Next.js with Output Directory \`${projectSettings.outputDirectory}\` override. Please change it back to the default.`,
      };
    }
    const nextVersion = deps['next'];
    if (!nextVersion) {
      return {
        metadata,
        fsApiBuilder: null,
        reason: `Detected Next.js in Project Settings but missing \`next\` package.json dependencies. Please run \`npm i next\`.`,
      };
    }

    // TODO: Read version from lockfile instead of package.json
    if (nextVersion !== 'latest' && nextVersion !== 'canary') {
      const fixedVersion = semver.valid(semver.coerce(nextVersion) || '');

      if (!fixedVersion || !semver.gte(fixedVersion, '12.0.0')) {
        return {
          metadata,
          fsApiBuilder: null,
          reason: `Detected legacy Next.js version "${nextVersion}" in package.json. Please run \`npm i next@latest\` to upgrade.`,
        };
      }
    }
  }

  if (!hasDotOutput) {
    // TODO: Read version from lockfile instead of package.json
    const vercelCliVersion = deps['vercel'];
    if (
      vercelCliVersion &&
      vercelCliVersion !== 'latest' &&
      vercelCliVersion !== 'canary'
    ) {
      const fixedVersion = semver.valid(semver.coerce(vercelCliVersion) || '');
      // TODO: we might want to use '24.0.0' once its released
      if (!fixedVersion || !semver.gte(fixedVersion, '23.1.3-canary.68')) {
        return {
          metadata,
          fsApiBuilder: null,
          reason: `Detected legacy Vercel CLI version "${vercelCliVersion}" in package.json. Please run \`npm i vercel@latest\` to upgrade.`,
        };
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

  const fsApiBuilder = {
    use: `@vercelruntimes/file-system-api${withTag}`,
    src: '**',
    config: {
      ...config,
      fileSystemAPI: true,
      framework: config.framework || framework || null,
      projectSettings,
      hasMiddleware,
      hasDotOutput,
    },
  };
  return { metadata, fsApiBuilder, reason: null };
}
