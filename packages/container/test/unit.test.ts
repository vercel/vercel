import type { BuildResultV2Typical } from '@vercel/build-utils';
import { describe, expect, it } from 'vitest';
import { build } from '../src';

const createBuildOptions = (config: Record<string, unknown>) => ({
  files: {},
  entrypoint: 'docker.io/library/nginx:1.27',
  workPath: '/',
  repoRootPath: '/',
  config,
});

function expectTypicalBuildResult(
  result: Awaited<ReturnType<typeof build>>
): BuildResultV2Typical {
  expect(result).toHaveProperty('output');
  return result as BuildResultV2Typical;
}

describe('@vercel/container', () => {
  it('passes the container image reference through as build output', async () => {
    const result = await build(
      createBuildOptions({ handler: 'docker.io/library/nginx:1.27' })
    );

    expect(result).toEqual({
      output: {
        index: {
          type: 'ContainerImage',
          files: {},
          handler: 'docker.io/library/nginx:1.27',
          runtime: 'container',
          environment: {},
        },
      },
    });
  });

  it('does not rewrite image references without registry', async () => {
    const result = expectTypicalBuildResult(
      await build(createBuildOptions({ image: 'grycap/cowsay:latest' }))
    );

    expect(result.output.index).toMatchObject({
      handler: 'grycap/cowsay:latest',
      runtime: 'container',
    });
  });

  it('normalizes a string command override to argv array form', async () => {
    const result = expectTypicalBuildResult(
      await build(
        createBuildOptions({
          image: 'docker.io/library/nginx:1.27',
          command: 'nginx -g daemon off;',
        })
      )
    );

    expect(result.output.index).toMatchObject({
      handler: 'docker.io/library/nginx:1.27',
      command: ['nginx -g daemon off;'],
    });
  });

  it('emits service builds at the internal service function path', async () => {
    const result = expectTypicalBuildResult(
      await build({
        ...createBuildOptions({ image: 'docker.io/library/nginx:1.27' }),
        service: {
          name: 'api',
          type: 'web',
        },
      })
    );

    expect(result.output).toHaveProperty('_svc/api/index');
    expect(result.output['_svc/api/index']).toMatchObject({
      handler: 'docker.io/library/nginx:1.27',
      runtime: 'container',
      environment: {},
    });
  });
});
