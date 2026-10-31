import { realpath } from 'fs/promises';
import { isAbsolute, relative, resolve, sep } from 'path';
import { NowBuildError } from './errors';
import type { Meta } from './types';

function contains(directory: string, file: string): boolean {
  const path = relative(directory, file);
  return (
    path === '' ||
    (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
  );
}

/**
 * Prevents automatic static publishing from including daemon sources.
 * A separate public directory is allowed inside a shared build context.
 */
export async function createDaemonStaticFileFilter({
  context,
  publishPath,
  serviceName,
}: {
  context: Meta['daemonContext'];
  publishPath: string;
  serviceName?: string;
}): Promise<(sourcePath: string) => Promise<boolean>> {
  if (!context || Object.keys(context.daemons).length === 0)
    return async () => true;

  const publish = resolve(publishPath);
  // Zero-config server apps publish an optional `public/`. A missing output
  // directory has nothing to publish, so its unresolved path is enough to
  // compare against.
  const realPublish = await realpath(publish).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return publish;
      throw error;
    }
  );
  const daemons = await Promise.all(
    Object.entries(context.daemons).map(async ([name, daemon]) => {
      const root = resolve(context.projectRoot, daemon.root);
      const dockerfile = resolve(root, daemon.entrypoint);
      const [realRoot, realDockerfile] = await Promise.all([
        realpath(root),
        realpath(dockerfile),
      ]);
      return { name, root, dockerfile, realRoot, realDockerfile };
    })
  );

  for (const daemon of daemons) {
    if (publish === daemon.root || realPublish === daemon.realRoot) {
      const publisher = serviceName ? `Service "${serviceName}"` : 'The app';
      throw new NowBuildError({
        code: 'INVALID_DAEMON_ROOT',
        message: `Can't build daemon "${daemon.name}": ${publisher} publishes "${relative(context.projectRoot, publish) || '.'}" as static files, but that is the daemon's root directory. Choose a separate output directory.`,
      });
    }
  }

  let warned = false;
  return async sourcePath => {
    const source = resolve(sourcePath);
    // Unresolvable sources must fail the build rather than bypass protection.
    const realSource = await realpath(source);
    const excluded = daemons.some(
      daemon =>
        source === daemon.dockerfile ||
        realSource === daemon.realDockerfile ||
        // Directory symlinks can expose daemon sources the glob doesn't list.
        contains(source, daemon.root) ||
        contains(realSource, daemon.realRoot) ||
        (contains(daemon.root, source) &&
          (!contains(daemon.root, publish) || !contains(publish, source))) ||
        (contains(daemon.realRoot, realSource) &&
          (!contains(daemon.realRoot, realPublish) ||
            !contains(realPublish, realSource)))
    );
    if (excluded && !warned) {
      console.warn(
        'Warning: Skipping static files under daemon roots. To publish them intentionally, copy them into a separate build output directory.'
      );
      warned = true;
    }
    return !excluded;
  };
}
