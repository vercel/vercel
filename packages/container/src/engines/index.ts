import { isBuildContainer, readString } from '../util';
import { buildahEngine } from './buildah';
import { dockerEngine } from './docker';
import {
  podmanEngine,
  getPrivatePodmanEngine,
  ensurePrivatePodmanInstalled,
  ensurePrivateMachine,
} from './podman';
import type { ContainerEngine, DevOutput } from './types';
import type { Span } from '@vercel/build-utils';

/**
 * Pick the container image toolchain for this environment. The Vercel build
 * container uses buildah (daemonless); developer machines use docker.
 *
 * Override with `VERCEL_CONTAINER_ENGINE=docker|buildah|podman|podman-private` for testing.
 * `podman-private` is the vendored, fully isolated runtime under ~/.vercel/runtimes/podman/
 * that never touches your PATH or system Podman.
 */
export function selectContainerEngine(): ContainerEngine {
  const override = readString(
    process.env.VERCEL_CONTAINER_ENGINE
  )?.toLowerCase();
  if (override === 'buildah') return buildahEngine;
  if (override === 'docker') return dockerEngine;
  if (override === 'podman') return podmanEngine;
  if (override === 'podman-private' || override === 'podman_private') {
    return getPrivatePodmanEngine();
  }
  return isBuildContainer() ? buildahEngine : dockerEngine;
}

export type DevEngineSource = 'system' | 'private-installable';

type DevEngineCandidate = {
  engine: ContainerEngine;
  label: string;
  hint: string;
  /** Where this candidate comes from — controls messaging on probe failure. */
  source?: DevEngineSource;
  /** When true: candidate is only tried after system engines missed, or when explicitly requested. */
  fallbackOnly?: boolean;
};

/**
 * Ordered list of engines to probe for `vercel dev`. Docker (including
 * Docker-compatible shims like OrbStack, Colima) is first because it is the
 * most widely installed; Podman is next as a fully rootless alternative.
 * `podman-private` is the zero-deps fallback: if no system engine exists,
 * we transparently auto-install a private runtime into ~/.vercel/runtimes/podman/.
 * Future: Apple Container (`container` CLI on macOS 26+) would slot after Podman.
 */
function devEngineCandidates(): DevEngineCandidate[] {
  // Lazily constructing the private engine so we don't eagerly call privateBin()
  // (which touches homedir) when not needed.
  const privateEngine = getPrivatePodmanEngine();
  return [
    {
      engine: dockerEngine,
      label: 'docker',
      hint: 'Docker Desktop, OrbStack, or Colima (`docker info` should succeed)',
      source: 'system',
    },
    {
      engine: podmanEngine,
      label: 'podman',
      hint: '`brew install podman && podman machine init --rootful=false && podman machine start` (macOS) or your package manager (Linux)',
      source: 'system',
    },
    {
      // Zero-deps fallback — no brew, no PATH. First `vercel dev` installs
      // into ~/.vercel/runtimes/podman/v<version> (~60-120MB + ~1-2GB VM on macOS),
      // isolated via XDG dirs and machine name "vercel".
      engine: privateEngine,
      label: 'podman-private',
      hint: 'private vendored runtime — auto-installs to ~/.vercel/runtimes/podman/ (no brew/PATH/sudo required; ~300MB download + VM on macOS)',
      source: 'private-installable',
      fallbackOnly: true,
    },
  ];
}

async function probeCandidate(
  c: DevEngineCandidate,
  out?: DevOutput,
  span?: Span
): Promise<ContainerEngine> {
  // For private-installable candidates we run full auto-install (bin + machine)
  // before marking probe as succeeded, so `vercel dev` works on a clean laptop
  // with honest size messaging emitted from ensurePrivate*.
  if (c.source === 'private-installable') {
    // Honest: user sees disk cost. If install fails we surface the error as a
    // normal candidate failure so the final aggregated error still helps.
    if (c.label === 'podman-private') {
      await ensurePrivatePodmanInstalled(out as DevOutput, span);
      await ensurePrivateMachine(out as DevOutput, span);
    }
  }
  await c.engine.devEnsureAvailable?.(out, span);
  return c.engine;
}

/**
 * Pick a dev-capable container engine, probing in priority order.
 *
 * - If `VERCEL_CONTAINER_ENGINE` is set, only that engine is tried (and must
 *   support dev; otherwise we throw with a clear message).
 * - Otherwise we probe `docker`, then `podman`, returning the first engine
 *   whose `devEnsureAvailable` succeeds.
 * - If none are available we throw an aggregated error listing what was tried
 *   and how to install an engine.
 */
async function tryCandidate(
  c: DevEngineCandidate,
  out: DevOutput | undefined,
  span: Span | undefined
): Promise<ContainerEngine> {
  if (c.source === 'private-installable') {
    return probeCandidate(c, out, span);
  }
  if (!c.engine.supportsDev || !c.engine.devEnsureAvailable) {
    throw new Error(`engine ${c.label} does not support dev`);
  }
  await c.engine.devEnsureAvailable(out, span);
  return c.engine;
}

export async function selectDevEngine(
  out?: DevOutput,
  span?: Span
): Promise<ContainerEngine> {
  const overrideRaw = readString(
    process.env.VERCEL_CONTAINER_ENGINE
  )?.toLowerCase();
  const candidates = devEngineCandidates();

  if (overrideRaw) {
    const found = candidates.find(c => c.label === overrideRaw);
    // `buildah` override is allowed for cloud builds but has no dev support.
    if (!found) {
      if (overrideRaw === 'buildah') {
        throw new Error(
          'The `buildah` engine does not support running containers for ' +
            '`vercel dev`. Use `VERCEL_CONTAINER_ENGINE=docker|podman|podman-private`.'
        );
      }
      throw new Error(
        `Unrecognized container engine "${overrideRaw}". Supported engines: docker, podman, podman-private, buildah.`
      );
    }
    const engine = found.engine;
    if (!engine.supportsDev || !engine.devEnsureAvailable) {
      throw new Error(
        `The \`${found.label}\` engine cannot run containers for \`vercel dev\`. ` +
          (engine.devUnavailableReason ??
            `Use \`VERCEL_CONTAINER_ENGINE=docker|podman|podman-private\`.`)
      );
    }
    try {
      // Use probeCandidate so private flow auto-installs on explicit selection too.
      return await probeCandidate(found, out, span);
    } catch (err) {
      const msg = (err as Error).message;
      throw new Error(
        `Selected container engine \`${found.label}\` (\`VERCEL_CONTAINER_ENGINE=${found.label}\`) is not available:\n\n${msg}`
      );
    }
  }

  // Phase 1: try system engines first (docker, podman on PATH). This is the
  // cheap / zero-download path. Phase 2: fall back to private-installable
  // after systems miss — with honest sizing output, since it involves download + VM disk.
  const systemCandidates = candidates.filter(c => !c.fallbackOnly);
  const fallbackCandidates = candidates.filter(c => c.fallbackOnly);

  const failures: Array<{ label: string; hint: string; error: string }> = [];

  for (const c of systemCandidates) {
    if (!c.engine.supportsDev || !c.engine.devEnsureAvailable) continue;
    try {
      const eng = await tryCandidate(c, out, span);
      return eng;
    } catch (err) {
      failures.push({
        label: c.label,
        hint: c.hint,
        error: (err as Error).message,
      });
    }
  }

  // No system engine succeeded — attempt private vendored runtime.
  // This downloads ~60-120MB + up to 1GB VM disk on macOS and is fully isolated.
  // Output is honest via emitters in ensurePrivate*.
  for (const c of fallbackCandidates) {
    if (!c.engine.supportsDev || !c.engine.devEnsureAvailable) continue;
    try {
      const eng = await probeCandidate(c, out, span);
      return eng;
    } catch (err) {
      failures.push({
        label: c.label,
        hint: c.hint,
        error: (err as Error).message,
      });
    }
  }

  const tried = failures
    .map(f => `  - ${f.label}: ${f.error.split('\n')[0]}`)
    .join('\n');
  const installHints = candidates
    .map(c => `  - ${c.label}: ${c.hint}`)
    .join('\n');

  throw new Error(
    [
      'No container engine available for `vercel dev`.',
      '',
      'Tried:',
      tried || '  (none — no dev-capable engines registered)',
      '',
      'Install one of:',
      installHints,
      '',
      'Or set `VERCEL_CONTAINER_ENGINE=docker|podman|podman-private` to force a specific engine.',
      '',
      // Honest private-runtime sizing note when user hits the failure with no engine at all.
      'For a clean machine with no Docker/Podman, `podman-private` will auto-install',
      'a private runtime to ~/.vercel/runtimes/podman/ (~60-120MB download, up to ~1-2GB',
      'VM disk on macOS) isolated to XDG dirs and never touching your PATH.',
    ].join('\n')
  );
}

export type {
  BuildPushParams,
  ContainerEngine,
  DevBuildParams,
  DevRunParams,
  DevOutput,
  DevContainerHandle,
} from './types';
export { VCR_REGISTRY, TARGET_PLATFORM } from './types';
