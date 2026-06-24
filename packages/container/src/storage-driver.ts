import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isBuildContainer, readString, run } from './util';

// buildah's image store (graphroot) lives under `/vercel`, which is already an
// XFS-backed cell volume, so it sits off the cell's overlay rootfs and the
// native `overlay` storage driver doesn't nest. runroot is transient state on
// tmpfs. These mirror the build image's `/etc/containers/storage.conf`
// (vercel/api#76567).
export const BUILDAH_GRAPH_ROOT = '/vercel/.containers/storage';
export const BUILDAH_RUN_ROOT = '/run/containers/storage';

/**
 * The storage driver we expect in the build container. The cell is granted
 * privileged-equivalent capabilities (vercel/hive#2310) and the build image's
 * `/etc/containers/storage.conf` points buildah's graphroot at the XFS
 * `/vercel` cell volume, so the native `overlay` driver works there. `vfs`
 * (slow full-copy) is a fallback we do not want silently.
 */
export const REQUIRED_BUILD_CONTAINER_DRIVER = 'overlay';

async function hasBinary(name: string): Promise<boolean> {
  try {
    await run('which', [name], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

let cachedStorageDriver: Promise<string | undefined> | undefined;

/** Test-only: clear the memoized driver so env changes take effect. */
export function __resetStorageDriverCache(): void {
  cachedStorageDriver = undefined;
}

/**
 * Pick a storage driver for container image builds.
 *
 * In the build container we defer to the build image's
 * `/etc/containers/storage.conf`, which configures the native `overlay` driver
 * with the graphroot under `/vercel` (an always-mounted XFS cell volume, so
 * overlay doesn't nest on the cell rootfs) and relies on the cell's privileged
 * capabilities (vercel/hive#2310). We return `undefined` so we don't pass a
 * `--storage-driver` flag that would override storage.conf.
 * `assertBuildContainerStorage()` reports (without failing) whether we actually
 * came up on overlay+XFS.
 *
 * Locally there is no storage.conf, so we pick the best available driver:
 * fuse-overlayfs when usable, otherwise vfs.
 *
 * `VERCEL_VCR_DOCKER_STORAGE_DRIVER` overrides the choice entirely (e.g. set it
 * to `vfs` to force a working driver if overlay can't initialize on a cell).
 */
export function selectStorageDriver(): Promise<string | undefined> {
  if (!cachedStorageDriver) {
    cachedStorageDriver = (async () => {
      const override = readString(process.env.VERCEL_VCR_DOCKER_STORAGE_DRIVER);
      if (override) {
        return override;
      }
      if (isBuildContainer()) {
        // Defer to /etc/containers/storage.conf (native overlay on /vercel).
        return undefined;
      }
      if ((await hasBinary('fuse-overlayfs')) && existsSync('/dev/fuse')) {
        return 'fuse-overlayfs';
      }
      return 'vfs';
    })();
  }
  return cachedStorageDriver;
}

/**
 * AL2023 SPAL buildah defaults to `short-name-mode = enforcing`, which fails in
 * CI/build cells (no TTY) for Dockerfile `FROM` lines like `traefik/whoami`.
 * Pass an explicit registries.conf so unqualified names resolve via docker.io.
 */
const BUILDAH_REGISTRIES_CONF = `unqualified-search-registries = ["docker.io"]
short-name-mode = "permissive"
`;

let cachedRegistriesConfPath: string | undefined;

function buildahRegistriesConfPath(): string {
  if (!cachedRegistriesConfPath) {
    const dir = mkdtempSync(join(tmpdir(), 'vercel-container-registries-'));
    cachedRegistriesConfPath = join(dir, 'registries.conf');
    writeFileSync(cachedRegistriesConfPath, BUILDAH_REGISTRIES_CONF);
  }
  return cachedRegistriesConfPath;
}

/** Global buildah CLI flags (storage + registry resolution). */
export async function buildahStorageArgs(): Promise<string[]> {
  const driver = await selectStorageDriver();
  const rootArgs = isBuildContainer()
    ? ['--root', BUILDAH_GRAPH_ROOT, '--runroot', BUILDAH_RUN_ROOT]
    : [];

  const registriesArgs = [
    '--registries-conf',
    buildahRegistriesConfPath(),
  ] as const;

  // In the build container `driver` is undefined: defer to storage.conf so the
  // native overlay driver (on the XFS volume) is used. Don't pass
  // `--storage-driver`, which would override storage.conf.
  if (!driver) {
    return [...rootArgs, ...registriesArgs];
  }
  if (driver === 'fuse-overlayfs') {
    return [
      ...rootArgs,
      ...registriesArgs,
      '--storage-driver',
      'overlay',
      '--storage-opt',
      'overlay.mount_program=/usr/bin/fuse-overlayfs',
    ];
  }
  return [...rootArgs, ...registriesArgs, '--storage-driver', driver];
}

export interface BuildahStoreInfo {
  graphRoot: string;
  runRoot: string;
  driver: string;
  backingFs: string;
}

/**
 * Read buildah's effective image store via `buildah info`.
 */
export async function readBuildahStoreInfo(): Promise<
  BuildahStoreInfo | undefined
> {
  const args = await buildahStorageArgs();
  const { stdout } = await run('buildah', [...args, 'info'], { quiet: true });
  const store = (JSON.parse(stdout) as { store?: Record<string, unknown> })
    .store;
  if (!store) {
    return undefined;
  }
  const graphStatus = store.GraphStatus as Record<string, string> | undefined;
  return {
    graphRoot: String(store.GraphRoot ?? ''),
    runRoot: String(store.RunRoot ?? ''),
    driver: String(store.GraphDriverName ?? ''),
    backingFs: String(
      graphStatus?.['Backing Filesystem'] ??
        graphStatus?.['Backing filesystem'] ??
        ''
    ),
  };
}

/**
 * In the build container, report whether buildah came up with the intended
 * storage: native `overlay` driver, graphroot under `/vercel`
 * (`/vercel/.containers/storage`), backed by a real (non-overlay) filesystem.
 *
 * This is observability-only by default: on a mismatch it logs loudly but does
 * NOT fail the build, so a cell where overlay can't initialize still builds
 * (falling back via `VERCEL_VCR_DOCKER_STORAGE_DRIVER`). Set
 * `VERCEL_VCR_STRICT_STORAGE=1` to make a mismatch a hard error.
 *
 * No-op outside the build container.
 */
export async function assertBuildContainerStorage(
  log: (message: string) => void = () => {}
): Promise<void> {
  if (!isBuildContainer()) {
    return;
  }
  if (readString(process.env.VERCEL_VCR_DOCKER_STORAGE_DRIVER)) {
    // Operator explicitly chose a driver; don't second-guess it.
    return;
  }

  const strict = Boolean(readString(process.env.VERCEL_VCR_STRICT_STORAGE));

  let storeInfo: BuildahStoreInfo | undefined;
  try {
    storeInfo = await readBuildahStoreInfo();
  } catch (err) {
    // `buildah info` itself failing (e.g. overlay can't init on this fs) is the
    // very condition we're reporting on; surface it but don't block by default.
    const message = `Could not verify buildah storage via \`buildah info\`: ${
      (err as Error).message
    }`;
    if (strict) {
      throw new Error(message);
    }
    log(message);
    return;
  }
  if (!storeInfo) {
    const message =
      'Could not verify buildah storage: `buildah info` returned no store data.';
    if (strict) {
      throw new Error(message);
    }
    log(message);
    return;
  }

  const problems: string[] = [];
  if (storeInfo.driver !== REQUIRED_BUILD_CONTAINER_DRIVER) {
    problems.push(
      `storage driver is "${storeInfo.driver}", expected ` +
        `"${REQUIRED_BUILD_CONTAINER_DRIVER}"`
    );
  }
  if (storeInfo.graphRoot !== BUILDAH_GRAPH_ROOT) {
    problems.push(
      `graphRoot is "${storeInfo.graphRoot}", expected the mounted ` +
        `volume "${BUILDAH_GRAPH_ROOT}"`
    );
  }
  // The volume is XFS; an overlay backing fs would mean we're on the cell
  // rootfs, not the mounted volume (overlay-on-overlay).
  if (storeInfo.backingFs && storeInfo.backingFs === 'overlayfs') {
    problems.push(
      `backing filesystem is "${storeInfo.backingFs}" (the overlay rootfs), ` +
        'not the mounted volume'
    );
  }

  const summary =
    `buildah storage: driver=${storeInfo.driver} ` +
    `graphRoot=${storeInfo.graphRoot} runRoot=${storeInfo.runRoot} ` +
    `backingFs=${storeInfo.backingFs || '?'}`;

  if (problems.length === 0) {
    log(`${summary} \u2014 verified`);
    return;
  }

  const detail =
    `${summary}\nProblems: ${problems.join('; ')}.\n` +
    'Expected the native overlay driver with the graphroot under the XFS ' +
    '`/vercel` cell volume (requires vercel/hive#2310 capabilities + the ' +
    'storage.conf from vercel/api#76567).';

  if (strict) {
    throw new Error(
      `Container build storage is not configured as intended.\n${detail}`
    );
  }
  // Observability-only by default: log loudly, keep building.
  log(
    `${detail}\nContinuing (set VERCEL_VCR_STRICT_STORAGE=1 to fail builds).`
  );
}
