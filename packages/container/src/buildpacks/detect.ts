import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Runtime matrix for "podman project vs container runtime".
 *
 * Your stated intent (WIP, wiring via vercel.json framework for now):
 *   - node/bun         → normal builders (@vercel/node etc), NOT @vercel/container
 *   - python           → normal builder (@vercel/python)
 *   - other runtimes (go / rust / java / ruby / php …) → buildpack path via @vercel/container lifecycle
 *   - dockerfile       → docker build via @vercel/container
 *
 * For now detection is driven by the container framework preset (vercel.json { frameworks: container })
 * which hands us entrypoint === '<detect>' and no Dockerfile on disk. We do NOT sniff
 * package.json here and claim node projects — node stays on its own builder.
 *
 * Future: when you want auto-detection without vercel.json, slot in:
 *   - go.mod          → buildpack (Paketo Go)
 *   - Cargo.toml      → buildpack (Paketo Rust)
 *   - pom.xml / build.gradle → buildpack (Paketo Java)
 *   Keep `package.json` / `requirements.txt` OUT — those have official builders
 *   and should not be hijacked by containers unless user opted in via framework.
 */

export type RuntimeFamily =
  | 'dockerfile' // Dockerfile / Containerfile present → docker path
  | 'prebuilt' // OCI image ref directly as entrypoint/handler
  | 'buildpack' // go / rust / java etc → lifecycle/creator
  | 'passthrough' // node / python / etc → NOT a container project; caller should bail
  | 'unknown';

export interface DetectProjectInput {
  workPath: string;
  hasDockerfile: boolean;
  /** Raw entrypoint provided by the orchestrator / framework preset (may be '<detect>'). */
  entrypointRef?: string;
  /** `framework` slug from vercel.json when explicitly set to `container`. */
  framework?: string;
  /** `config.handler` when present — signals prebuilt oci image reference. */
  handler?: string;
}

const NORMAL_RUNTIME_MARKERS = new Set([
  'package.json', // node / bun
  'bun.lockb',
  'requirements.txt', // python
  'pyproject.toml',
  'Pipfile',
  'poetry.lock',
]);

const BUILDPACK_OPT_IN_MARKERS = new Set([
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Gemfile',
  'composer.json',
  'mix.exs',
]);

/**
 * Whether this project should use the lifecycle buildpack path when no
 * Dockerfile is present.
 *
 * Rules (order matters):
 *   1. `framework: container` (explicit opt-in from vercel.json) → buildpack
 *      when no Dockerfile/prebuilt. This is how your test will force the path.
 *   2. `project.toml` present → buildpack (explicit CNB opt-in marker).
 *   3. Only buildpack markers (go/rust/java…) and NO normal-runtime markers
 *      (package.json / requirements.txt) → buildpack. This prevents node/python
 *      from accidentally becoming containers when they have their own builders.
 *   4. Normal runtime markers only → passthrough (not a container project at all).
 *   5. Otherwise unknown → caller decides (error for container builder, noop for framework detection).
 */
export function isBuildpackProject(opts: {
  workPath: string;
  hasDockerfile: boolean;
  framework?: string;
  projectTomlPresent?: boolean;
}): boolean {
  if (opts.hasDockerfile) return false;

  if ((opts.framework ?? '').toLowerCase() === 'container') return true;

  if (
    opts.projectTomlPresent ??
    existsSync(join(opts.workPath, 'project.toml'))
  ) {
    return true;
  }

  const { workPath } = opts;
  const hasBuildpackMarker = [...BUILDPACK_OPT_IN_MARKERS].some(n =>
    existsSync(join(workPath, n))
  );
  const hasNormalMarker = [...NORMAL_RUNTIME_MARKERS].some(n =>
    existsSync(join(workPath, n))
  );

  // go/rust/java explicitly want buildpacks; node/python explicitly do not.
  if (hasBuildpackMarker && !hasNormalMarker) return true;

  return false;
}

export function detectRuntimeFamily(input: DetectProjectInput): RuntimeFamily {
  if (input.hasDockerfile) return 'dockerfile';
  if (input.handler && input.handler.includes('/')) return 'prebuilt';
  // Raw image ref as entrypoint (eg 'ghcr.io/foo/bar:latest') — no slash check would be ambiguous vs "app"
  if (
    input.entrypointRef &&
    /[:@]/.test(input.entrypointRef) &&
    !input.entrypointRef.startsWith('<') &&
    !input.entrypointRef.includes('.')
  ) {
    // Very loose, but the real prebuilt gate lives in index.ts (non-Dockerfile + config.handler / image ref)
    return 'prebuilt';
  }

  const frameworkOptIn = (input.framework ?? '').toLowerCase() === 'container';

  if (
    isBuildpackProject({
      workPath: input.workPath,
      hasDockerfile: false,
      framework: frameworkOptIn ? 'container' : input.framework,
    })
  ) {
    return 'buildpack';
  }

  if (frameworkOptIn && input.workPath) {
    // Explicit framework=container with bare workDir and no language file yet
    // (project.toml might appear later or buildpack list expanded) — still a buildpack
    // candidate rather than unknown, so dev can show actionable error.
    return 'buildpack';
  }

  // node/bun/python project without framework=container → not a container project.
  // Caller will error with a helpful hint rather than silently containerizing node.
  return frameworkOptIn ? 'buildpack' : 'unknown';
}

export const BUILDPACK_SOURCE_MARKERS = [...BUILDPACK_OPT_IN_MARKERS];
export const NORMAL_RUNTIME_MARKERS_LIST = [...NORMAL_RUNTIME_MARKERS];
