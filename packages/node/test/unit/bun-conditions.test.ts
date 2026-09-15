import type { NodejsLambda } from '@vercel/build-utils';
import { describe, expect, it } from 'vitest';
import { build } from '../../src';
import { prepareFilesystem } from './test-utils';

describe('Bun export conditions', () => {
  it('traces Node conditional exports used by the Bun runtime', async () => {
    const filesystem = await prepareFilesystem(
      {
        'api/index.ts': `
        import { condition } from 'conditional-export';
        export default { fetch: () => new Response(condition) };
      `,
        'node_modules/conditional-export/package.json': JSON.stringify({
          name: 'conditional-export',
          type: 'module',
          exports: {
            '.': {
              node: './node.js',
              default: './default.js',
            },
          },
        }),
        'node_modules/conditional-export/node.js':
          "export const condition = 'node';",
        'node_modules/conditional-export/default.js':
          "export const condition = 'default';",
      },
      'vercel-node-bun-conditions-tests'
    );

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/index.ts',
      config: { bunVersion: '1.x' },
      meta: { skipDownload: true },
    });
    const lambda = buildResult.output as NodejsLambda;

    expect(
      lambda.files['node_modules/conditional-export/node.js']
    ).toBeDefined();
  });
});
