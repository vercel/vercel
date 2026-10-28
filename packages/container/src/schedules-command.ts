import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BuildPushParams, ContainerEngine } from './engines/types';

export interface SchedulesCommand {
  /** The schedule's `root`, relative to the project. It is the build context. */
  root: string;
  command: [string, ...string[]];
}

/**
 * The dispatcher reads the command from the function's environment rather
 * than the image, so schedules can share an image.
 */
export const SCHEDULES_COMMAND_ENV = 'VERCEL_SCHEDULE_COMMAND';

const DISPATCHER = 'schedules-command-dispatcher';

/** Build the schedule's Dockerfile, then derive an image that runs the dispatcher. */
export async function buildSchedulesCommandImage(
  engine: ContainerEngine,
  params: BuildPushParams,
  dispatcher = join(__dirname, DISPATCHER)
): Promise<void> {
  const baseImage = await engine.build(params);
  // Docker keeps ONBUILD triggers, so deriving the image would run them against
  // the dispatcher's build context, and `vc deploy --prebuilt` would ship that
  // image. Buildah writes OCI images, which drop the triggers with a warning.
  if ((await engine.onBuildTriggers?.(baseImage))?.length) {
    throw new Error(
      `"${params.dockerfilePath}" declares ONBUILD instructions, which only run when another image is built from it. Remove them from the schedule's Dockerfile.`
    );
  }
  const contextDir = await mkdtemp(join(tmpdir(), 'vercel-schedules-image-'));
  try {
    await copyFile(dispatcher, join(contextDir, DISPATCHER));
    const dockerfilePath = join(contextDir, 'Dockerfile');
    await writeFile(
      dockerfilePath,
      [
        `FROM ${baseImage}`,
        `COPY --chmod=0555 ${DISPATCHER} /__vercel_runtime/${DISPATCHER}`,
        `ENTRYPOINT ["/__vercel_runtime/${DISPATCHER}"]`,
      ].join('\n')
    );
    // Reuses the schedule image's local tag, so `push()` ships this image.
    await engine.build({
      ...params,
      contextDir,
      dockerfilePath,
      buildArgs: undefined,
      baseImageIsLocal: true,
    });
  } finally {
    await rm(contextDir, { recursive: true, force: true });
  }
}
