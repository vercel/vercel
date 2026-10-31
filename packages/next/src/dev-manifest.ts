import {
  getLambdaOptionsFromFunction,
  NowBuildError,
  type DevFunction,
  type GetDevManifest,
} from '@vercel/build-utils';
import minimatch from 'minimatch';
import { join, posix } from 'path';
import {
  loadNextDevRoutingConfig,
  type NextDevRoutingConfig,
} from './next-dev-config';
import { normalizeIndexOutput } from './utils';

export const getDevManifest: GetDevManifest = async ({
  workPath,
  build,
  files,
  config,
  env,
}) => {
  const functions = new Map<string, DevFunction>();
  const matchedFunctionPatterns = new Set<string>();
  const entries = Object.entries(config.functions ?? {});
  const entryDirectory = build.src ? posix.dirname(build.src) : '.';
  const prefix = entryDirectory === '.' ? '' : `${entryDirectory}/`;
  const sources = [...new Set(files)].filter(file => file.startsWith(prefix));
  let nextConfig: NextDevRoutingConfig | undefined;

  for (const sourceFile of sources) {
    const relativeFile = sourceFile.slice(prefix.length);
    // Standalone api/ functions and other builders' sources are not Next entries.
    if (!/^(?:src\/)?(?:app|pages)\//.test(relativeFile)) continue;
    const matched = entries.find(
      ([pattern]) => sourceFile === pattern || minimatch(sourceFile, pattern)
    );
    const pattern = matched?.[0];
    const hasTriggers = !!matched?.[1].experimentalTriggers?.length;
    nextConfig ??= await loadNextDevRoutingConfig(
      join(workPath, entryDirectory),
      env,
      sources.map(file => file.slice(prefix.length))
    );
    const file = relativeFile.replace(/^src\//, '');
    const extension = [...nextConfig.pageExtensions]
      .sort((a, b) => b.length - a.length)
      .find(ext => file.endsWith(`.${ext}`));
    const extensionless = extension ? file.slice(0, -extension.length - 1) : '';
    const isPagesApi = /^pages\/api(?:\/.+)?$/.test(extensionless);
    const isAppRoute = /^app\/(?:.+\/)?route$/.test(extensionless);
    const isPage =
      extensionless.startsWith('pages/') ||
      /^app\/(?:.+\/)?page$/.test(extensionless);
    // Globs configure framework entrypoints, not colocated modules. Exact
    // non-entry paths still get a diagnostic instead of silently disappearing.
    if (!isPagesApi && !isAppRoute && !isPage && pattern !== sourceFile) {
      continue;
    }

    const routerDirectory = file.split('/')[0];
    if (
      relativeFile.startsWith('src/') &&
      sources.some(candidate =>
        candidate.startsWith(`${prefix}${routerDirectory}/`)
      )
    ) {
      if (!hasTriggers) continue;
      throw new NowBuildError({
        code: 'NEXT_DEV_MANIFEST_FUNCTION_UNSUPPORTED',
        message: `Cannot include "${sourceFile}" in the development manifest: Next.js uses the root ${routerDirectory} directory instead of src/${routerDirectory}. Move the handler and its functions configuration to the active router directory.`,
      });
    }

    let pathname: string | undefined;
    if (isPagesApi) {
      pathname = extensionless.replace(/^pages/, '').replace(/\/index$/, '');
    } else if (
      isAppRoute &&
      !file.split('/').some(segment => segment.startsWith('_'))
    ) {
      pathname = `/${file
        .split('/')
        .slice(1, -1)
        .filter(segment => !(segment.startsWith('(') && segment.endsWith(')')))
        .join('/')}`;
    }
    if (
      !pathname ||
      !/^\/(?:[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)?$/.test(pathname) ||
      pathname.split('/').some(segment => segment === '.' || segment === '..')
    ) {
      if (!hasTriggers) continue;
      throw new NowBuildError({
        code: 'NEXT_DEV_MANIFEST_FUNCTION_UNSUPPORTED',
        message: `Cannot include "${sourceFile}" in the development manifest. Configure a static Next.js App Router route handler (app/**/route.*) or Pages API route (pages/api.* or pages/api/**) matching pageExtensions. Dynamic, private, parallel, and intercepted routes and rendered pages are not supported.`,
      });
    }

    // Match index.ts's build mount. Next rejects basePath with nested builds.
    if (nextConfig.basePath && entryDirectory !== '.') {
      throw new NowBuildError({
        code: 'NEXT_BASEPATH_LEGACY_BUILDS',
        message:
          'basePath can not be used with `builds` in vercel.json, use Project Settings to configure your monorepo instead',
      });
    }
    const outputDirectory = posix.join(entryDirectory, nextConfig.basePath);
    // getServerlessPages maps App Router / to index; server-build preserves
    // App Router index segments but normalizes Pages API index outputs.
    const outputName = posix.join(
      outputDirectory,
      pathname === '/' ? 'index' : pathname
    );
    let outputPath = isPagesApi
      ? normalizeIndexOutput(outputName, true)
      : outputName;
    if (nextConfig.edgeRuntimeFiles?.includes(relativeFile)) {
      // getEdgeFunctions uses basePath, not entryDirectory, and normalizes
      // trailing index segments only when basePath is configured.
      outputPath = posix.join(
        '.',
        nextConfig.basePath,
        pathname === '/' ? 'index' : pathname
      );
      if (nextConfig.basePath) {
        outputPath = normalizeIndexOutput(outputPath, true);
      }
    }
    const existing = functions.get(outputPath);
    if (existing) {
      throw new NowBuildError({
        code: 'NEXT_DEV_MANIFEST_FUNCTION_COLLISION',
        message: `Next.js sources "${existing.sourceFile}" and "${sourceFile}" resolve to the same development manifest output "${outputPath}". Each function must have a unique deployment output identity.`,
      });
    }

    const { experimentalTriggers } = await getLambdaOptionsFromFunction({
      sourceFile,
      config,
    });
    let invocationPathname =
      `${nextConfig.basePath}${pathname === '/' ? '' : pathname}` || '/';
    // Match Next's load-custom-routes :notfile redirect against the mounted
    // URL, including its .well-known exclusion and explicit basePath root rule.
    if (
      nextConfig.trailingSlash &&
      !nextConfig.skipTrailingSlashRedirect &&
      ((pathname === '/' && nextConfig.basePath) ||
        new RegExp(
          '^/(?!\\.well-known(?:/.*)?)(?:[^/]+/)*[^/\\.]+$',
          nextConfig.caseSensitiveRoutes ? '' : 'i'
        ).test(invocationPathname))
    ) {
      invocationPathname += '/';
    }
    functions.set(outputPath, {
      outputPath,
      sourceFile,
      invocation: {
        type: 'http',
        pathname: invocationPathname,
      },
      ...(experimentalTriggers === undefined ? {} : { experimentalTriggers }),
    });
    if (pattern) matchedFunctionPatterns.add(pattern);
  }

  return {
    functions: [...functions.values()],
    matchedFunctionPatterns: [...matchedFunctionPatterns],
  };
};
