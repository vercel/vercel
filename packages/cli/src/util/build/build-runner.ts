import type {
  BuilderV2,
  BuilderV3,
  BuilderVX,
  BuildOptions,
  BuildResultV2,
  BuildResultV3,
  BuildResultVX,
  Span,
} from '@vercel/build-utils';
import type { BuilderDiagnostics } from './builder-process';

/**
 * Everything a runner needs from the command, without dragging the command's
 * closure state across the abstraction. The build loop keeps ownership of env
 * injection, the pre-deploy entry, and result post-processing; the runner
 * performs the build, reports its trace events under `builderSpan`, collects
 * diagnostics, and (for subprocess builds) manages the worker.
 */
export interface BuildRunnerContext {
  /** Absolute path to the builder module entrypoint (BuilderWithPkg.path). */
  requirePath: string;
  buildOptions: BuildOptions;
  /** The build's working directory (buildWorkPath). */
  cwd: string;
  /** Whether this build has a configured pre-deploy command. */
  expectsPreDeploy: boolean;
  /** The `vc.builder` span this build runs under; child spans/events attach to it. */
  builderSpan: Span;
  /**
   * When set, every stdout/stderr line the forked build produces is prefixed with
   * `[vc:service:<name>] ` before reaching the terminal. The Vercel build-container strips
   * this tag and uses it to attribute each build log line to a service. Only meaningful for
   * subprocess builds; ignored by the in-process runner.
   */
  serviceName?: string;
}

export type RawBuildResult = BuildResultV2 | BuildResultV3 | BuildResultVX;

/**
 * A single builder run. Owns only the difference between running a builder
 * in-process and in a forked worker: the build invocation, whether it produces
 * its own diagnostics, and teardown of any worker it started.
 *
 * `teardown()` must always be called by the caller once the runner is no longer
 * needed (after the deferred pre-deploy loop), regardless of build outcome — this
 * is how kept-alive pre-deploy workers are guaranteed to be released even when a
 * later build or pre-deploy callback throws.
 */
export abstract class BuildRunner {
  protected readonly ctx: BuildRunnerContext;

  constructor(ctx: BuildRunnerContext) {
    this.ctx = ctx;
  }

  abstract build(): Promise<RawBuildResult>;

  abstract diagnostics(): Promise<BuilderDiagnostics | undefined>;

  /** Release any resources (e.g. a forked worker). Must be idempotent. */
  abstract teardown(): void;
}

/** Runs a builder in the current process. */
export class InprocessBuildRunner extends BuildRunner {
  private readonly builder: BuilderV2 | BuilderV3 | BuilderVX;

  constructor(
    ctx: BuildRunnerContext,
    builder: BuilderV2 | BuilderV3 | BuilderVX
  ) {
    super(ctx);
    this.builder = builder;
  }

  async build(): Promise<RawBuildResult> {
    return await this.builder.build(this.ctx.buildOptions);
  }

  async diagnostics(): Promise<BuilderDiagnostics | undefined> {
    return await this.ctx.builderSpan
      .child('vc.builder.diagnostics')
      .trace(
        async () => await this.builder.diagnostics?.(this.ctx.buildOptions)
      );
  }

  teardown(): void {
    // Nothing to tear down for an in-process build.
  }
}
