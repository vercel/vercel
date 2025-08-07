import { describe, expect, test } from 'vitest';
import { build } from '../../src';
import { prepareFilesystem } from './test-utils';
import { join } from 'path';

// Normalize paths for Windows compatibility
const normalizePath = (path: string) => path.replace(/\\/g, '/');

describe.skipIf(process.platform === 'win32')('.mts file support', () => {
  test('should compile .mts files to .mjs', async () => {
    const filesystem = await prepareFilesystem({
      'package.json': JSON.stringify({
        type: 'module',
        dependencies: {
          '@types/node': '*',
        },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Node',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          types: ['node'],
        },
        include: ['*.mts'],
      }),
      'index.mts': `
        import { IncomingMessage, ServerResponse } from 'http';

        interface RequestHandler {
          (req: IncomingMessage, res: ServerResponse): void;
        }

        const handler: RequestHandler = (req, res) => {
          const message = \`Hello from .mts! Method: \${req.method}\`;
          res.setHeader('Content-Type', 'text/plain');
          res.end(message);
        };

        export default handler;
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'index.mts',
      config: {},
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');

    // Check that the handler was renamed from .mts to .mjs
    if (buildResult.output.type === 'Lambda') {
      expect(normalizePath(buildResult.output.handler)).toBe('index.mjs');
    }

    // Verify that the compiled .mjs file exists in the output
    const files =
      buildResult.output.type === 'Lambda' ? buildResult.output.files : {};
    expect(files).toHaveProperty('index.mjs');
    expect(files).toHaveProperty('index.mjs.map');
  });

  test('should handle .mts files with ES module imports', async () => {
    const filesystem = await prepareFilesystem({
      'package.json': JSON.stringify({
        type: 'module',
        dependencies: {
          '@types/node': '*',
        },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Node',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          types: ['node'],
        },
        include: ['*.mts'],
      }),
      'utils.mts': `
        export const getMessage = (name: string): string => {
          return \`Hello, \${name}!\`;
        };
      `,
      'index.mts': `
        import { IncomingMessage, ServerResponse } from 'http';
        import { getMessage } from './utils.mts';

        export default (req: IncomingMessage, res: ServerResponse) => {
          const message = getMessage('MTS World');
          res.setHeader('Content-Type', 'text/plain');
          res.end(message);
        };
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'index.mts',
      config: {},
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');

    // Check that both files were compiled
    const files =
      buildResult.output.type === 'Lambda' ? buildResult.output.files : {};
    expect(files).toHaveProperty('index.mjs');
    expect(files).toHaveProperty('utils.mjs');
    expect(files).toHaveProperty('index.mjs.map');
    expect(files).toHaveProperty('utils.mjs.map');
  });

  test('should handle .mts files in nested directories', async () => {
    const filesystem = await prepareFilesystem({
      'package.json': JSON.stringify({
        type: 'module',
        dependencies: {
          '@types/node': '*',
        },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Node',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          types: ['node'],
        },
        include: ['**/*.mts'],
      }),
      [join('api', 'handler.mts')]: `
        import { IncomingMessage, ServerResponse } from 'http';

        export default (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ message: 'API from .mts file', path: req.url }));
        };
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: join('api', 'handler.mts'),
      config: {},
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');

    // Check that the nested handler was compiled correctly
    if (buildResult.output.type === 'Lambda') {
      expect(normalizePath(buildResult.output.handler)).toBe('api/handler.mjs');
    }

    const files =
      buildResult.output.type === 'Lambda' ? buildResult.output.files : {};
    expect(files).toHaveProperty('api/handler.mjs');
    expect(files).toHaveProperty('api/handler.mjs.map');
  });
});
