import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasCommand, isBuildContainer, readString } from './util';

// Buildah's graphroot lives on the mounted XFS volume, outside the cell's
// overlay rootfs. These match the build image's storage.conf (vercel/api#76567).
export const BUILDAH_GRAPH_ROOT = '/vercel/.containers/storage';
export const BUILDAH_RUN_ROOT = '/run/containers/storage';
export const REQUIRED_BUILD_CONTAINER_DRIVER = 'overlay';

let cachedStorageDriver: Promise<string | undefined> | undefined;

/** Test-only: clear the memoized driver so env changes take effect. */
export function __resetStorageDriverCache(): void {
  cachedStorageDriver = undefined;
}

/**
 * Defer to storage.conf in the build container; locally prefer fuse-overlayfs
 * when available and fall back to vfs. An explicit environment override wins.
 */
export function selectStorageDriver(): Promise<string | undefined> {
  if (!cachedStorageDriver) {
    cachedStorageDriver = (async () => {
      const override = readString(process.env.VERCEL_VCR_DOCKER_STORAGE_DRIVER);
      if (override) return override;
      if (isBuildContainer()) return undefined;
      if ((await hasCommand('fuse-overlayfs')) && existsSync('/dev/fuse')) {
        return 'fuse-overlayfs';
      }
      return 'vfs';
    })();
  }
  return cachedStorageDriver;
}

// The build image defaults to enforcing short names, but builds have no TTY.
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

/** Global Buildah flags for native storage and short-name resolution. */
export async function buildahStorageArgs(): Promise<string[]> {
  const driver = await selectStorageDriver();
  const rootArgs = isBuildContainer()
    ? ['--root', BUILDAH_GRAPH_ROOT, '--runroot', BUILDAH_RUN_ROOT]
    : [];
  const registriesArgs = [
    '--registries-conf',
    buildahRegistriesConfPath(),
  ] as const;

  if (!driver) return [...rootArgs, ...registriesArgs];
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
