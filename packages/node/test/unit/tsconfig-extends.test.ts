import { describe, expect, test } from 'vitest';
import { build } from '../../src';
import { prepareFilesystem } from './test-utils';

describe.skipIf(process.platform === 'win32')('tsconfig extends chain', () => {
  test('should respect module/moduleResolution inherited from base tsconfig', async () => {
    const filesystem = await prepareFilesystem({
      'package.json': JSON.stringify({
        type: 'module',
        dependencies: {
          '@types/node': '*',
        },
      }),
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
        },
      }),
      // Only extends — no direct module/moduleResolution
      'tsconfig.json': JSON.stringify({
        extends: './tsconfig.base.json',
        include: ['*.ts'],
      }),
      'utils.ts': `
          export const greet = (name: string): string => \`Hello, \${name}!\`;
        `,
      // Extensionless import: valid under "Bundler", fails with TS2835 under "NodeNext"
      'index.ts': `
          import { IncomingMessage, ServerResponse } from 'http';
          import { greet } from './utils';

          export default (req: IncomingMessage, res: ServerResponse) => {
            res.end(greet('World'));
          };
        `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'index.ts',
      config: {},
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');

    const files =
      buildResult.output.type === 'Lambda' ? buildResult.output.files : {};
    expect(files).toHaveProperty('index.js');
    expect(files).toHaveProperty('utils.js');
  });
});
