import {
  BUILDAH_GRAPH_ROOT,
  REQUIRED_BUILD_CONTAINER_DRIVER,
  buildahStorageArgs,
} from '../storage-driver';
import type { RunResult } from '../util';
import { debug, isBuildContainer, readString, run } from '../util';

/** Lets each command hold a lock on the image store while it runs. */
export interface BuildahCommandLock {
  wrap(command: string[]): Promise<string[]>;
}

export interface BuildahRunOptions {
  input?: string;
  quiet?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface BuildahStoreInfo {
  graphRoot: string;
  runRoot: string;
  driver: string;
  backingFs: string;
}

/** One build's command execution and lazily queried, stable metadata. */
export class BuildahClient {
  private cachedVersion: Promise<string> | undefined;
  private cachedStoreInfo: Promise<BuildahStoreInfo | undefined> | undefined;

  constructor(private readonly lock: BuildahCommandLock) {}

  async run(
    args: string[],
    options: BuildahRunOptions = {}
  ): Promise<RunResult> {
    const fullArgs = [...(await buildahStorageArgs()), ...args];
    debug(`exec: buildah ${fullArgs.join(' ')}`);
    const start = Date.now();
    try {
      const [command, ...commandArgs] = await this.lock.wrap([
        'buildah',
        ...fullArgs,
      ]);
      const result = await run(command, commandArgs, options);
      debug(`buildah ${args[0]} finished in ${Date.now() - start}ms`);
      return result;
    } catch (error) {
      debug(`buildah ${args[0]} failed after ${Date.now() - start}ms`);
      throw error;
    }
  }

  /** Version checks must not open the store or acquire its lock before restore. */
  version(): Promise<string> {
    this.cachedVersion ??= run('buildah', ['--version'], { quiet: true })
      .then(({ stdout }) => stdout.trim())
      .catch(error => {
        this.cachedVersion = undefined;
        throw error;
      });
    return this.cachedVersion;
  }

  /** Only stable store fields are cached; image and container counts are not. */
  info(): Promise<BuildahStoreInfo | undefined> {
    this.cachedStoreInfo ??= this.readStoreInfo().then(
      store => {
        if (!store) this.cachedStoreInfo = undefined;
        return store;
      },
      error => {
        this.cachedStoreInfo = undefined;
        throw error;
      }
    );
    return this.cachedStoreInfo;
  }

  /** Storage mismatches are diagnostic unless strict verification is requested. */
  async verifyStorage(
    log: (message: string) => void = () => {}
  ): Promise<void> {
    if (!isBuildContainer()) return;
    if (readString(process.env.VERCEL_VCR_DOCKER_STORAGE_DRIVER)) return;
    const strict = Boolean(readString(process.env.VERCEL_VCR_STRICT_STORAGE));

    let storeInfo: BuildahStoreInfo | undefined;
    try {
      storeInfo = await this.info();
    } catch (error) {
      const message = `Could not verify buildah storage via \`buildah info\`: ${
        (error as Error).message
      }`;
      if (strict) throw new Error(message);
      log(message);
      return;
    }
    if (!storeInfo) {
      const message =
        'Could not verify buildah storage: `buildah info` returned no store data.';
      if (strict) throw new Error(message);
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
    log(
      `${detail}\nContinuing (set VERCEL_VCR_STRICT_STORAGE=1 to fail builds).`
    );
  }

  private async readStoreInfo(): Promise<BuildahStoreInfo | undefined> {
    const { stdout } = await this.run(['info'], { quiet: true });
    const store = (JSON.parse(stdout) as { store?: Record<string, unknown> })
      .store;
    if (!store) return undefined;
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
}
