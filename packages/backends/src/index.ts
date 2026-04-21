import { downloadInstallAndBundle } from './utils.js';
import { generateProjectManifest } from './diagnostics.js';
import {
  defaultCachePathGlob,
  glob,
  NodejsLambda,
  debug,
  getNodeVersion,
  getLambdaOptionsFromFunction,
  Span,
  type PrepareCache,
  type BuildV2,
  type Lambda,
  type NodejsLambdaOptions,
  isBunVersion,
} from '@vercel/build-utils';
import { findEntrypointOrThrow } from './cervel/index.js';
import { applyServiceVcInit } from './service-vc-init.js';
// Re-export cervel functions for use by other packages
export {
  build as cervelBuild,
  serve as cervelServe,
  findEntrypoint,
  findEntrypointOrThrow,
  nodeFileTrace,
  getBuildSummary,
  srvxOptions,
} from './cervel/index.js';
export type {
  CervelBuildOptions,
  CervelServeOptions,
  PathOptions,
} from './cervel/index.js';
import { rolldown } from './rolldown/index.js';
import { introspection } from './rolldown/introspection.js';
import { nft } from './rolldown/nft.js';
import { maybeDoBuildCommand } from './build.js';
import { typescript } from './typescript.js';
import { Colors as c } from './cervel/utils.js';

// Re-export introspection functions
export { introspectApp } from './introspection/index.js';
export { diagnostics } from './diagnostics.js';

export const version = 2;

/** Non-empty Build Command from project settings / vercel.json (not the default `build` script). */
function hasExplicitBuildCommand(
  config: Parameters<BuildV2>[0]['config']
): boolean {
  const cmd = config.buildCommand ?? config.projectSettings?.buildCommand;
  return typeof cmd === 'string' && cmd.trim().length > 0;
}

export const build: BuildV2 = async args => {
  const downloadResult = await downloadInstallAndBundle(args);
  const nodeVersion = await getNodeVersion(
    args.workPath,
    undefined,
    args.config,
    args.meta
  );
  const isBun = isBunVersion(nodeVersion);
  const builderName = '@vercel/backends';

  const span =
    args.span ??
    new Span({
      name: builderName,
    });

  span.setAttributes({
    'builder.name': builderName,
  });

  const buildSpan = span.child('vc.builder.backends.build');

  return buildSpan.trace(async () => {
    const entrypoint = await findEntrypointOrThrow(args.workPath);
    debug('Entrypoint', entrypoint);
    args.entrypoint = entrypoint;

    const userBuildResult = await maybeDoBuildCommand(args, downloadResult);

    const functionConfig = args.config.functions?.[entrypoint];
    if (functionConfig) {
      args.config.includeFiles = [
        ...normalizeArray(args.config.includeFiles),
        ...normalizeArray(functionConfig.includeFiles),
      ];
      args.config.excludeFiles = [
        ...normalizeArray(args.config.excludeFiles),
        ...normalizeArray(functionConfig.excludeFiles),
      ];
    }

    // Always run rolldown, even if the user has provided a build command
    // It's very fast and we use it for introspection.
    const rolldownResult = await rolldown({
      ...args,
      span: buildSpan,
    });

    // Only hono's introspection is supported for now
    const introspectionPromise =
      rolldownResult.framework.slug === 'hono'
        ? introspection({
            ...args,
            span: buildSpan,
            files: rolldownResult.files,
            handler: rolldownResult.handler,
          })
        : Promise.resolve({
            routes: [],
            additionalFolders: [],
            additionalDeps: [],
          });

    // This must come after the build command since turbo repo workspace deps may need to be transpiled.
    // Skip tsc when the user configured a Build Command — they own compilation/typechecking there.
    let typescriptPromise: Promise<unknown>;
    if (hasExplicitBuildCommand(args.config)) {
      console.log(
        c.gray(
          `${c.bold(c.cyan('✓'))} Typecheck skipped ${c.gray(
            '(Build Command is configured)'
          )}`
        )
      );
      typescriptPromise = Promise.resolve();
    } else {
      typescriptPromise = typescript({
        entrypoint,
        workPath: args.workPath,
        span: buildSpan,
      });
    }

    const localBuildFiles =
      userBuildResult?.localBuildFiles.size > 0
        ? userBuildResult?.localBuildFiles
        : rolldownResult.localBuildFiles;

    const files = userBuildResult?.files || rolldownResult.files;
    const handler = userBuildResult?.handler || rolldownResult.handler;
    const nftWorkPath = userBuildResult?.outputDir || args.workPath;

    await nft({
      ...args,
      workPath: nftWorkPath,
      localBuildFiles,
      files,
      ignoreNodeModules: false,
      ignore: args.config.excludeFiles,
      conditions: isBun ? ['bun'] : undefined,
      span: buildSpan,
    });

    try {
      await generateProjectManifest({
        workPath: args.workPath,
        nodeVersion,
        cliType: downloadResult.cliType,
        lockfilePath: downloadResult.lockfilePath,
        lockfileVersion: downloadResult.lockfileVersion,
        framework: rolldownResult.framework.slug || undefined,
      });
    } catch (err) {
      debug(
        `Failed to write node manifest: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const baseDir = args.repoRootPath || args.workPath;
    const includeResults = await Promise.all(
      normalizeArray(args.config.includeFiles).map(pattern =>
        glob(pattern, baseDir)
      )
    );
    for (const matched of includeResults) {
      for (const [relPath, entry] of Object.entries(matched)) {
        files[relPath] = entry;
      }
    }

    const introspectionResult = await introspectionPromise;
    await typescriptPromise;

    const functionConfigOverrides = await getLambdaOptionsFromFunction({
      sourceFile: entrypoint,
      config: args.config,
    });

    const serviceRoutePrefix = normalizeServiceRoutePrefix(
      args.config?.routePrefix ?? args.service?.routePrefix
    );
    const shouldStripServiceRoutePrefix =
      !!serviceRoutePrefix &&
      (typeof args.config?.serviceName === 'string' || !!args.service);

    let lambdaFiles = files;
    let lambdaHandler = handler;
    if (shouldStripServiceRoutePrefix) {
      const shimmedLambda = await applyServiceVcInit({
        files,
        handler,
        workPath: nftWorkPath,
      });
      lambdaFiles = shimmedLambda.files;
      lambdaHandler = shimmedLambda.handler;
    }

    const lambdaArgs: NodejsLambdaOptions = {
      runtime: nodeVersion.runtime,
      handler: lambdaHandler,
      files: lambdaFiles,
      framework: rolldownResult.framework,
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: true,
      awsLambdaHandler: '',
      ...functionConfigOverrides,
      shouldDisableAutomaticFetchInstrumentation:
        process.env.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION ===
        '1',
    };

    const lambda = new NodejsLambda(lambdaArgs);
    if (shouldStripServiceRoutePrefix && serviceRoutePrefix) {
      lambda.environment = {
        ...lambda.environment,
        VERCEL_SERVICE_ROUTE_PREFIX: serviceRoutePrefix,
        VERCEL_SERVICE_ROUTE_PREFIX_STRIP: '1',
      };
    }
    const serviceName =
      typeof args.config?.serviceName === 'string' &&
      args.config.serviceName !== ''
        ? args.config.serviceName
        : undefined;
    const internalServiceFunctionPath =
      typeof serviceName === 'string' && serviceName !== ''
        ? `/_svc/${serviceName}/index`
        : undefined;
    const internalServiceOutputPath = internalServiceFunctionPath?.slice(1);
    const remapRouteDestination = <T extends { src?: string; dest?: string }>(
      route: T
    ): T => {
      const prefixedRoute = maybePrefixServiceRouteSource(
        route,
        serviceRoutePrefix
      );
      if (!internalServiceFunctionPath || !route.dest) {
        return prefixedRoute;
      }
      return {
        ...prefixedRoute,
        dest: internalServiceFunctionPath,
      };
    };

    // Build routes: filesystem handler, then introspected routes, then catch-all
    const routes = [
      {
        handle: 'filesystem',
      },
      ...introspectionResult.routes.map(remapRouteDestination),
      {
        src: getServiceCatchallSource(serviceRoutePrefix),
        dest: internalServiceFunctionPath ?? '/',
      },
    ];

    const output: Record<string, Lambda> = internalServiceOutputPath
      ? { [internalServiceOutputPath]: lambda }
      : { index: lambda };

    for (const route of routes) {
      if (route.dest) {
        if (route.dest === '/') {
          continue;
        }
        // Only the exact service alias needs the leading slash removed.
        const outputPath =
          route.dest === internalServiceFunctionPath &&
          internalServiceOutputPath
            ? internalServiceOutputPath
            : route.dest;
        output[outputPath] = lambda;
      }
    }

    return {
      routes,
      output,
    };
  });
};

export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob(defaultCachePathGlob, repoRootPath || workPath);
};

const normalizeArray = (value: any) =>
  Array.isArray(value) ? value : value ? [value] : [];

const normalizeServiceRoutePrefix = (routePrefix: unknown) => {
  if (
    typeof routePrefix !== 'string' ||
    routePrefix === '' ||
    routePrefix === '.'
  ) {
    return undefined;
  }

  let normalized = routePrefix.startsWith('/')
    ? routePrefix
    : `/${routePrefix}`;
  if (normalized !== '/' && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized === '/' ? undefined : normalized;
};

const maybePrefixServiceRouteSource = <
  T extends { src?: string; dest?: string },
>(
  route: T,
  routePrefix?: string
): T => {
  if (
    !routePrefix ||
    typeof route.dest !== 'string' ||
    !route.dest.startsWith('/')
  ) {
    return route;
  }

  return {
    ...route,
    src: getPrefixedRouteSource(route.src, route.dest, routePrefix),
  };
};

const getPrefixedRouteSource = (
  routeSource: string | undefined,
  routePath: string,
  routePrefix: string
) => {
  if (!routeSource) {
    return routeSource;
  }

  if (routePath === routePrefix || routePath.startsWith(`${routePrefix}/`)) {
    return routeSource;
  }

  const escapedRoutePrefix = toRegexSource(routePrefix);
  if (routeSource.startsWith('^(?:')) {
    return `^(?:${escapedRoutePrefix}${routeSource.slice(4)}`;
  }
  if (routeSource.startsWith('^')) {
    return `^${escapedRoutePrefix}${routeSource.slice(1)}`;
  }
  return `${escapedRoutePrefix}${routeSource}`;
};

const getServiceCatchallSource = (routePrefix?: string) => {
  if (!routePrefix) {
    return '/(.*)';
  }

  return `^${escapeForRegex(routePrefix)}(?:/(.*))?$`;
};

const escapeForRegex = (value: string) =>
  value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');

const toRegexSource = (value: string) =>
  escapeForRegex(value).replaceAll('/', '\\/');
