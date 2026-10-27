import { rename, writeFile } from 'node:fs/promises';
import { debug } from '../util';
import { buildahStoreCacheEnabled } from './config';
import { writeStateRecord } from './state';

/**
 * Image IDs from `buildah build --layers` output. Buildah writes RUN output and
 * its `--> <id>` lines to one stream, so an ID can follow output that has no
 * trailing newline. Buildah omits these lines when given `--iidfile`.
 */
export function imageIdsFromBuildOutput(output: string): string[] {
  const ids = new Set<string>();
  for (const match of output.matchAll(
    /--> (?:Using cache )?([a-f0-9]{12,64})[ \t\r]*$/gm
  )) {
    ids.add(match[1]);
  }
  return [...ids];
}

/** A pending record stops a cache save from pruning after an unfinished build. */
export class BuildahImageUsage {
  private constructor(private readonly path: string) {}

  static async begin(): Promise<BuildahImageUsage | undefined> {
    if (!buildahStoreCacheEnabled()) {
      return undefined;
    }
    try {
      return new BuildahImageUsage(
        await writeStateRecord('.images', 'pending\n')
      );
    } catch (error) {
      debug(
        `could not record Buildah image usage: ${(error as Error).message}`
      );
      return undefined;
    }
  }

  /** A failure leaves the record pending, so the save stops instead of pruning blindly. */
  async record(images: () => string[] | Promise<string[]>): Promise<void> {
    try {
      const ids = (await images()).map(id => id.replace(/^sha256:/, ''));
      if (ids.length === 0) {
        throw new Error('no Buildah image IDs were recorded');
      }
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, `${ids.join('\n')}\n`, { mode: 0o600 });
      await rename(temporary, this.path);
    } catch (error) {
      debug(
        `could not record Buildah image usage: ${(error as Error).message}`
      );
    }
  }
}
