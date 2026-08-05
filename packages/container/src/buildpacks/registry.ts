import type { Config } from '@vercel/build-utils';
import type { TriggerEventInput } from '@vercel/build-utils';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LARAVEL_INTEGRATION } from './integrations/laravel';

/**
 * A language supported by Cloud Native Buildpack container builds.
 *
 * The CNB lifecycle is language-agnostic — everything that varies per
 * language lives in this descriptor. Adding a language means adding one
 * entry to {@link BUILDPACKS} (plus the fs-detectors `BUILDPACK_RUNTIMES`
 * entry and, optionally, a framework preset); no lifecycle or resolution
 * code should change.
 */
export interface BuildpackDescriptor {
  /**
   * Runtime slug, matching the services `runtime` value and the `buildpack`
   * builder-config field set by fs-detectors (e.g. `"ruby"`).
   */
  runtime: string;
  /**
   * Vercel framework preset slugs (from `@vercel/frameworks`) that select
   * this buildpack, for requests arriving via the framework-preset path:
   * builds-and-routes detection puts only `framework` in builder config (it
   * has no notion of buildpacks), so the slug must map back to a descriptor
   * here. Defaults to `[runtime]` — the runtime preset's slug. Add entries
   * only when a *distinct* preset should build with this buildpack (a future
   * `rails` preset would live here as `['rails']`; a hypothetical Elixir
   * descriptor with `runtime: "elixir"` might carry `['phoenix']`).
   */
  frameworkSlugs?: readonly string[];
  /**
   * Files that mark a service root as buildable by this buildpack. Any one
   * marker suffices, so list only files the buildpack's detect phase
   * requires (a `Gemfile` is mandatory for Ruby; a `config.ru` or `Procfile`
   * alone is not buildable). Used to fail fast with an actionable error
   * before pulling a multi-GB builder — Paketo's own detect phase stays
   * authoritative.
   */
  projectMarkers: readonly string[];
  /**
   * Trusted CNB builder image containing the language family buildpacks and
   * the lifecycle. Pinned by digest: deployments run this image on Vercel
   * build infrastructure, so a mutable tag would make builds unreproducible
   * and track upstream pushes we haven't vetted. Bump deliberately.
   *
   * TODO: the pinned Paketo `jammy-base` builder is amd64-only, so `vercel
   * dev` pins the whole image chain to `linux/amd64` (see the platform
   * pinning in `lifecycle.ts` `buildWithLifecycle`) and Apple Silicon builds
   * and serves the app under emulation. Evaluate a multi-arch builder (e.g.
   * Paketo's ubuntu-noble builders) or dual-stack digest pinning so dev runs
   * natively on arm64.
   */
  builder: string;
  /**
   * Run image matching the builder's stack, pinned by digest for the same
   * reason. Passed to the lifecycle explicitly so the exported image doesn't
   * depend on the mutable run-image tag recorded in the builder metadata.
   */
  runImage: string;
  /**
   * Buildpacks the lifecycle may detect with, written to an explicit
   * `order.toml` instead of running the builder's full default order. This
   * keeps detection deterministic in mixed-language roots: a `go.mod` next
   * to a `Gemfile` must not let another language family out-detect the
   * requested Ruby build. IDs and versions must match buildpacks installed
   * in the pinned builder.
   *
   * Paketo language-family composites already include the optional procfile
   * buildpack (which `command` overrides rely on); list it explicitly only
   * for descriptors whose buildpacks don't.
   */
  buildpackGroup: readonly BuildpackGroupEntry[];
  /**
   * Build-time defaults passed to the buildpack detect/build phases. Plain
   * user build env values override these defaults. Use this for buildpack
   * configuration such as the web server or document root; launch-time app
   * configuration belongs in {@link launchEnvDefaults} instead.
   */
  buildEnvDefaults?: Readonly<Record<string, string>>;
  /**
   * User-facing launch-env defaults applied beneath the user's build env.
   * The lifecycle writes these in Paketo's `BPE_DEFAULT_<KEY>` form so the
   * CNB launcher uses them only when the variable is unset at run time. A
   * matching project `<KEY>` is copied to `BPE_<KEY>` so it overrides the
   * default in the built image. Each applied default is logged.
   */
  launchEnvDefaults?: Readonly<Record<string, string>>;
  /** Framework-only additions resolved beneath the language descriptor. */
  frameworkIntegrations?: Readonly<
    Record<string, FrameworkBuildpackIntegration>
  >;
  /** Bundled buildpacks materialized by the generic lifecycle. */
  bundledBuildpacks?: readonly BundledBuildpack[];
  /** Framework defaults added to the generated function when none are set. */
  defaultTriggers?: readonly TriggerEventInput[];
}

export interface FrameworkBuildpackIntegration {
  buildpack?: BundledBuildpack;
  buildEnvDefaults?: Readonly<Record<string, string>>;
  launchEnvDefaults?: Readonly<Record<string, string>>;
  defaultTriggers?: readonly TriggerEventInput[];
}

export interface BundledBuildpack {
  id: string;
  version: string;
  files: Readonly<Record<string, string>>;
}

export interface BuildpackGroupEntry {
  id: string;
  version: string;
  optional?: boolean;
}

/**
 * Paketo publishes one builder per stack, not per language: `jammy-base`
 * covers Ruby/Node/Go/Python and more, `jammy-full` adds PHP and web
 * servers. A new language may reuse an existing builder ref or introduce
 * the larger one — that choice stays inside its descriptor.
 */
export const BUILDPACKS: readonly BuildpackDescriptor[] = [
  {
    runtime: 'ruby',
    projectMarkers: ['Gemfile'],
    builder:
      'paketobuildpacks/builder-jammy-base@sha256:622ba9d364d69f578b49fa8dee2e0d450adbd44b31e7c0a18b714a4eefdf371b',
    runImage:
      'index.docker.io/paketobuildpacks/run-jammy-base@sha256:6de43ef8f4a30fa7b01be23600b2a0433c3ed3851b4fddc3b375212ed69490c2',
    // The composite includes rackup/puma/etc process detection and the
    // optional procfile buildpack in every group.
    buildpackGroup: [{ id: 'paketo-buildpacks/ruby', version: '2.0.1' }],
    // Heroku-style production defaults, baked into the image at build time
    // and overridable by project build env; harmless for non-Rails apps.
    // (Paketo's MRI buildpack already defaults MALLOC_ARENA_MAX=2.) The
    // RAILS_LOG_TO_STDOUT/RAILS_SERVE_STATIC_FILES values deliberately match
    // the `=true` Paketo's rails-assets buildpack contributes for Rails apps
    // (its defaults come earlier in the composite and launch-env defaults
    // are first-set-wins), so the observed value is identical for Rails and
    // non-Rails apps. Rails itself only checks presence.
    // Deployment-level (runtime) env vars are injected into container-image
    // functions and override baked values — except vars the app server
    // reassigns at boot (puma's launcher rewrites `ENV['RACK_ENV']` from its
    // `environment` directive).
    //
    // TODO: when Rails is detected and neither SECRET_KEY_BASE nor
    // RAILS_MASTER_KEY is configured, generate a per-deployment
    // BPE_DEFAULT_SECRET_KEY_BASE so production requests don't 500 with
    // "Missing secret_key_base" (with a log line noting sessions reset each
    // deploy), and add a CLI prompt that persists a generated value as a
    // project env var — the durable store — instead of hiding the secret in
    // the build cache the way Heroku does.
    launchEnvDefaults: {
      RAILS_ENV: 'production',
      RACK_ENV: 'production',
      RAILS_LOG_TO_STDOUT: 'true',
      RAILS_SERVE_STATIC_FILES: 'true',
    },
  },
  {
    runtime: 'php',
    frameworkSlugs: ['laravel'],
    projectMarkers: ['composer.json'],
    builder:
      'paketobuildpacks/builder-jammy-full@sha256:ff93606b6c4f9ff9ee2dd623f5d3f57c9ebe87f3e6911e15df8380a0ddfc4d54',
    runImage:
      'index.docker.io/paketobuildpacks/run-jammy-full@sha256:3aa2505f36156a28c9f6eb74229f9dd39827de26ed94c426463902c091fb85a6',
    buildpackGroup: [
      // Modern Laravel applications conventionally use Vite. Keep Node
      // optional so composer-only PHP projects still detect and build.
      { id: 'paketo-buildpacks/nodejs', version: '10.7.0', optional: true },
      { id: 'paketo-buildpacks/php', version: '2.19.9' },
    ],
    buildEnvDefaults: {
      BP_NODE_RUN_SCRIPTS: 'build',
      BP_PHP_SERVER: 'nginx',
      BP_PHP_WEB_DIR: 'public',
      BP_PHP_ENABLE_HTTPS_REDIRECT: 'false',
      BP_COMPOSER_INSTALL_OPTIONS:
        '--no-dev --no-interaction --no-progress --prefer-dist --optimize-autoloader',
    },
    launchEnvDefaults: {
      APP_ENV: 'production',
      APP_DEBUG: 'false',
      LOG_CHANNEL: 'stderr',
      SESSION_DRIVER: 'cookie',
      CACHE_STORE: 'array',
    },
    frameworkIntegrations: {
      laravel: LARAVEL_INTEGRATION,
    },
  },
];

/**
 * Resolve the buildpack a builder config asks for, via either signal:
 * `buildpack` (set by services resolution in fs-detectors) or `framework`
 * (set by the framework preset path in builds-and-routes detection).
 */
export function requestedBuildpack(
  config: Config | null | undefined
): BuildpackDescriptor | undefined {
  if (!config) return undefined;
  const descriptor =
    BUILDPACKS.find(bp => config.buildpack === bp.runtime) ??
    BUILDPACKS.find(
      bp =>
        typeof config.framework === 'string' &&
        (bp.frameworkSlugs ?? [bp.runtime]).includes(config.framework)
    );
  if (!descriptor || typeof config.framework !== 'string') return descriptor;

  const integration = descriptor.frameworkIntegrations?.[config.framework];
  if (!integration) return descriptor;
  return {
    ...descriptor,
    buildpackGroup: integration.buildpack
      ? [
          ...descriptor.buildpackGroup,
          {
            id: integration.buildpack.id,
            version: integration.buildpack.version,
          },
        ]
      : descriptor.buildpackGroup,
    buildEnvDefaults: {
      ...descriptor.buildEnvDefaults,
      ...integration.buildEnvDefaults,
    },
    launchEnvDefaults: {
      ...descriptor.launchEnvDefaults,
      ...integration.launchEnvDefaults,
    },
    bundledBuildpacks: integration.buildpack
      ? [...(descriptor.bundledBuildpacks ?? []), integration.buildpack]
      : descriptor.bundledBuildpacks,
    defaultTriggers: integration.defaultTriggers,
  };
}

/**
 * Per-language image override, e.g. `VERCEL_BUILDPACK_RUBY_BUILDER`.
 *
 * Honored only by the `vercel dev` build path: it exists to make testing a
 * new builder or run image cheap before bumping the pinned digests (local
 * dev, integration tests). Production deploys always use the pinned
 * registry digests — shipping a digest change goes through a normal
 * `@vercel/container` release/canary, never an env var (which would
 * otherwise be reachable through user-supplied build env). Overrides are
 * per language on purpose — a single generic variable would silently force
 * one stack's builder onto every buildpack service in a mixed-language
 * project.
 */
function envOverride(
  bp: BuildpackDescriptor,
  suffix: string
): string | undefined {
  return (
    process.env[
      `VERCEL_BUILDPACK_${bp.runtime.toUpperCase()}_${suffix}`
    ]?.trim() || undefined
  );
}

/**
 * The builder image `vercel dev` runs the lifecycle in: the language
 * override (`VERCEL_BUILDPACK_<RUNTIME>_BUILDER`) or the descriptor's pinned
 * default. Overrides may use a tag or an immutable digest reference.
 * Dev-only — the deploy path uses the pinned {@link BuildpackDescriptor.builder}
 * directly.
 */
export function devBuilderImageRef(bp: BuildpackDescriptor): string {
  return envOverride(bp, 'BUILDER') ?? bp.builder;
}

/**
 * The run image `vercel dev` exports against, or `undefined` to let the
 * builder's own metadata decide. The pinned default only applies with the
 * default builder: an overridden builder may target a different stack, and
 * forcing our run image onto it would produce a broken pairing. Dev-only —
 * the deploy path uses the pinned {@link BuildpackDescriptor.runImage}
 * directly.
 */
export function devRunImageRef(bp: BuildpackDescriptor): string | undefined {
  const override = envOverride(bp, 'RUN_IMAGE');
  if (override) return override;
  return envOverride(bp, 'BUILDER') ? undefined : bp.runImage;
}

/**
 * Whether the service root shows language evidence for this buildpack.
 * Dockerfile precedence is handled by image-source resolution, not here.
 */
export function hasProjectMarkers(
  bp: BuildpackDescriptor,
  workPath: string
): boolean {
  return bp.projectMarkers.some(name => existsSync(join(workPath, name)));
}
