import { sortBuilders } from '@vercel-internals/builder-orchestration/sort-builders';
import type { BuilderWithPkg } from '@vercel-internals/builder-orchestration/import-builders';
import type {
  BuildOptions,
  BuildResultV2,
  BuildResultV3,
  BuildResultVX,
  Span,
} from '@vercel/build-utils';
import type { Framework } from '@vercel/frameworks';
import type { Route } from '@vercel/routing-utils';
import { InprocessBuildRunner, type BuildRunner } from './build-runner';

export interface ExecuteBuilderOptions {
  builder: BuilderWithPkg['builder'];
  buildOptions: BuildOptions;
  span: Span;
  isFrontendBuilder: boolean | undefined;
  hasDetectedServices: boolean;
  framework?: Framework;
  /**
   * Strategy used to invoke the builder. Defaults to running it in the current
   * process; `vc build` supplies a forked-worker runner when the build is
   * eligible (see `canBuildInSubprocess`).
   */
  runner?: BuildRunner;
}

export interface ExecutedBuilder {
  buildResult: BuildResultV2 | BuildResultV3;
  rawBuildResult: BuildResultV2 | BuildResultV3 | BuildResultVX;
}

/** The Builder invocation boundary shared by CLI-driven Builder E2Es. */
export async function executeBuilder({
  builder,
  buildOptions,
  span,
  isFrontendBuilder,
  hasDetectedServices,
  framework,
  runner,
}: ExecuteBuilderOptions): Promise<ExecutedBuilder> {
  const buildRunner =
    runner ??
    new InprocessBuildRunner(
      {
        requirePath: '',
        buildOptions,
        cwd: buildOptions.workPath,
        expectsPreDeploy: false,
        builderSpan: span,
      },
      builder
    );
  const rawBuildResult = await span.trace<
    BuildResultV2 | BuildResultV3 | BuildResultVX
  >(() => buildRunner.build());
  // A subprocess runner returns whatever the worker produced, so the VX unwrap
  // is guarded on the wrapper actually being present rather than on the
  // builder's declared version alone.
  const buildResult =
    builder.version === -1 && 'resultVersion' in rawBuildResult
      ? (rawBuildResult as BuildResultVX).result
      : (rawBuildResult as BuildResultV2 | BuildResultV3);

  if (
    !hasDetectedServices &&
    buildOptions.config.zeroConfig &&
    isFrontendBuilder &&
    'output' in buildResult &&
    !buildResult.routes &&
    framework
  ) {
    buildResult.routes = await getFrameworkRoutes(
      framework,
      buildOptions.workPath
    );
  }

  return { buildResult, rawBuildResult };
}

export const sortBuildsForExecution = sortBuilders;

async function getFrameworkRoutes(
  framework: Framework,
  dirPrefix: string
): Promise<Route[]> {
  if (typeof framework.defaultRoutes === 'function') {
    return framework.defaultRoutes(dirPrefix);
  }
  return Array.isArray(framework.defaultRoutes) ? framework.defaultRoutes : [];
}
