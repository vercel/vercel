import { existsSync } from 'fs';
import { realpath } from 'fs/promises';
import { isAbsolute, join, relative, sep } from 'path';
import {
  type Builder,
  type DaemonConfig,
  getDaemonImageRepository,
  NowBuildError,
  normalizePath,
} from '@vercel/build-utils';

/**
 * Daemons whose names differ only in repeated dashes, like `a-b` and `a--b`,
 * resolve to the same image repository, so they can't both be built.
 */
export function validateDaemonImageRepositories(
  daemons: Record<string, DaemonConfig> | undefined
): void {
  const owners = new Map<string, string>();
  for (const name of Object.keys(daemons ?? {})) {
    const repository = getDaemonImageRepository(name);
    const owner = owners.get(repository);
    if (owner !== undefined) {
      throw new NowBuildError({
        code: 'INVALID_DAEMONS',
        message: `Can't build daemon "${name}": daemon "${owner}" uses the same image repository "${repository}". Rename one of them.`,
      });
    }
    owners.set(repository, name);
  }
}

/** The Dockerfile of each daemon, relative to the project. */
export function getDaemonDockerfiles(
  daemons: Record<string, DaemonConfig> | undefined
): Set<string> {
  return new Set(
    Object.values(daemons ?? {}).map(daemon =>
      normalizePath(join(daemon.root, daemon.entrypoint))
    )
  );
}

/** Root files that make detection pick the Container framework preset. */
const CONTAINER_PRESET_FILES = [
  'Dockerfile.vercel',
  'Containerfile.vercel',
  'Dockerfile',
  'Containerfile',
];

/**
 * Whether the Container preset would only be detected, or only build, because
 * of a daemon's Dockerfile at the project root. Detecting it then would also
 * deploy the daemon as the project's app.
 */
export function isContainerPresetFromDaemons(
  workPath: string,
  daemons: Record<string, DaemonConfig> | undefined
): boolean {
  const present = CONTAINER_PRESET_FILES.filter(name =>
    existsSync(join(workPath, name))
  );
  if (present.length === 0) return false;
  const daemonDockerfiles = getDaemonDockerfiles(daemons);
  // `@vercel/container` builds an opt-in marker, else a plain `Dockerfile`.
  const built = present.find(name => name !== 'Containerfile');
  return (
    (built !== undefined && daemonDockerfiles.has(built)) ||
    present.every(name => daemonDockerfiles.has(name))
  );
}

/** One `@vercel/container` build per daemon. */
export async function getDaemonBuilders({
  workPath,
  repoRootPath = workPath,
  daemons,
  files,
}: {
  workPath: string;
  /**
   * A daemon `root` can point above `workPath` up to here, such as `../..` in
   * a monorepo, when those files are in the build.
   */
  repoRootPath?: string;
  daemons: Record<string, DaemonConfig> | undefined;
  files: string[];
}): Promise<Builder[]> {
  if (daemons === undefined) return [];
  const root = await realpath(workPath);
  const repoRoot = await realpath(repoRootPath);
  return Promise.all(
    Object.entries(daemons).map(async ([name, daemon]) => {
      const source = normalizePath(join(daemon.root, daemon.entrypoint));
      // `files` only lists the project, so sources above it are checked on disk.
      const aboveProject = source.startsWith('../');
      const invalidSource = (reason: string) =>
        new NowBuildError({
          code: 'INVALID_DAEMON_ROOT',
          message: `Can't build daemon "${name}": "${source}" ${reason}`,
        });
      const notInProject = invalidSource(
        "isn't in the project files. Check `root` and `entrypoint`, and that .vercelignore doesn't exclude it."
      );
      if (
        isAbsolute(daemon.root) ||
        (!aboveProject && !files.includes(source))
      ) {
        throw notInProject;
      }
      // Reject Dockerfiles that resolve outside the project, or outside the
      // repository for sources above the project, through symlinks.
      const dockerfile = await realpath(join(workPath, source)).catch(() => {
        throw notInProject;
      });
      const relativePath = relative(aboveProject ? repoRoot : root, dockerfile);
      if (
        isAbsolute(relativePath) ||
        relativePath === '..' ||
        relativePath.startsWith(`..${sep}`)
      ) {
        throw invalidSource(
          aboveProject
            ? 'is outside the repository.'
            : 'is a symlink to a file outside the project.'
        );
      }
      return {
        src: source,
        use: '@vercel/container',
        config: { daemon: { name, ...daemon } },
      };
    })
  );
}
