import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { buildSchedulesCommandImage } from '../src/schedules-command';
import type { BuildPushParams, ContainerEngine } from '../src/engines/types';

it.each([
  [[]],
  [['COPY payload /payload']],
])('derives the dispatcher image unless ONBUILD triggers are pending (%j)', async triggers => {
  const params: BuildPushParams = {
    contextDir: '/project/jobs',
    dockerfilePath: '/project/jobs/Dockerfile.jobs',
    imageRef: 'vcr.vercel.com/team/project/schedule:deployment',
    repository: 'schedule',
    registry: 'vcr.vercel.com',
    username: 'user',
    token: 'token',
    buildArgs: { PROJECT_ARG: 'value' },
  };
  const localImage = 'localhost/schedule:local';
  const derived: string[] = [];
  const engine = {
    build: vi.fn(async (build: BuildPushParams) => {
      if (build !== params)
        derived.push(await readFile(build.dockerfilePath, 'utf8'));
      return localImage;
    }),
    onBuildTriggers: vi.fn(async () => triggers),
  };
  const result = buildSchedulesCommandImage(
    engine as unknown as ContainerEngine,
    params,
    __filename
  );
  if (triggers.length) {
    await expect(result).rejects.toThrow('declares ONBUILD');
    expect(engine.build).toHaveBeenCalledOnce();
    return;
  }
  await result;
  expect(engine.onBuildTriggers).toHaveBeenCalledExactlyOnceWith(localImage);
  expect(engine.build).toHaveBeenLastCalledWith(
    expect.objectContaining({
      imageRef: params.imageRef,
      buildArgs: undefined,
      baseImageIsLocal: true,
    })
  );
  expect(derived).toEqual([
    [
      `FROM ${localImage}`,
      'COPY --chmod=0555 schedules-command-dispatcher /__vercel_runtime/schedules-command-dispatcher',
      'ENTRYPOINT ["/__vercel_runtime/schedules-command-dispatcher"]',
    ].join('\n'),
  ]);
});

it('emits a private schedule function with its command in the environment', async () => {
  const { build, CONTAINER_OUTPUT_PATH } = await import('../src');
  const result = await build({
    files: {},
    entrypoint: 'Dockerfile.jobs',
    workPath: '/project',
    repoRootPath: '/project',
    config: {
      command: ['must-not-bypass-dispatcher'],
      schedulesCommand: { root: '.', command: ['python', 'a b', '', '$HOME'] },
    },
    meta: { isDev: true },
  });
  expect(result).toMatchObject({
    routes: [],
    output: {
      [CONTAINER_OUTPUT_PATH]: {
        runtime: 'container',
        environment: { VERCEL_SCHEDULE_COMMAND: '["python","a b","","$HOME"]' },
        experimentalTriggers: [{ type: 'schedule/v1beta' }],
      },
    },
  });
  if (!('output' in result) || !result.output || Array.isArray(result.output))
    throw new Error('Expected function output');
  expect(result.output[CONTAINER_OUTPUT_PATH]).not.toHaveProperty('command');
});
