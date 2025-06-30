import path from 'path';
import { tmpdir } from 'os';
import fs from 'fs-extra';
import { createZip, Lambda } from '../src/lambda';
import type { CloudEventTrigger, Files } from '../src/types';
import { FileBlob, glob, spawnAsync } from '../src';
import { describe, expect, it } from 'vitest';

const MODE_DIRECTORY = 16877; /* drwxr-xr-x */
const MODE_FILE = 33188; /* -rw-r--r-- */

describe('Lambda', () => {
  it('should create zip file with symlinks', async () => {
    if (process.platform === 'win32') {
      console.log('Skipping test on windows');
      return;
    }
    const files = await glob('**', path.join(__dirname, 'symlinks'));
    expect(Object.keys(files)).toHaveLength(4);

    const outFile = path.join(__dirname, 'symlinks.zip');
    await fs.remove(outFile);

    const outDir = path.join(__dirname, 'symlinks-out');
    await fs.remove(outDir);
    await fs.mkdirp(outDir);

    await fs.writeFile(outFile, await createZip(files));
    await spawnAsync('unzip', [outFile], { cwd: outDir });

    const [linkStat, linkDirStat, aStat] = await Promise.all([
      fs.lstat(path.join(outDir, 'link.txt')),
      fs.lstat(path.join(outDir, 'link-dir')),
      fs.lstat(path.join(outDir, 'a.txt')),
    ]);
    expect(linkStat.isSymbolicLink()).toEqual(true);
    expect(linkDirStat.isSymbolicLink()).toEqual(true);
    expect(aStat.isFile()).toEqual(true);
  });

  it('should create zip file with empty directory', async () => {
    if (process.platform === 'win32') {
      console.log('Skipping test on windows');
      return;
    }

    const dir = await fs.mkdtemp(path.join(tmpdir(), 'create-zip-empty-dir'));
    try {
      const files = {
        a: new FileBlob({
          data: 'contents',
          mode: MODE_FILE,
        }),
        empty: new FileBlob({
          data: '',
          mode: MODE_DIRECTORY,
        }),
        'b/a': new FileBlob({
          data: 'inside dir b',
          mode: MODE_FILE,
        }),
        c: new FileBlob({
          data: '',
          mode: MODE_DIRECTORY,
        }),
        'c/a': new FileBlob({
          data: 'inside dir c',
          mode: MODE_FILE,
        }),
      };

      const outFile = path.join(dir, 'lambda.zip');

      const outDir = path.join(dir, 'out');
      await fs.mkdirp(outDir);

      await fs.writeFile(outFile, await createZip(files));
      await spawnAsync('unzip', [outFile], { cwd: outDir });

      expect(fs.statSync(path.join(outDir, 'empty')).isDirectory()).toEqual(
        true
      );
      expect(fs.statSync(path.join(outDir, 'b')).isDirectory()).toEqual(true);
      expect(fs.statSync(path.join(outDir, 'c')).isDirectory()).toEqual(true);
      expect(fs.readFileSync(path.join(outDir, 'a'), 'utf8')).toEqual(
        'contents'
      );
      expect(fs.readFileSync(path.join(outDir, 'b/a'), 'utf8')).toEqual(
        'inside dir b'
      );
      expect(fs.readFileSync(path.join(outDir, 'c/a'), 'utf8')).toEqual(
        'inside dir c'
      );
      expect(fs.readdirSync(path.join(outDir, 'empty'))).toHaveLength(0);
    } finally {
      await fs.remove(dir);
    }
  });

  describe('CloudEventTrigger', () => {
    const files: Files = {};

    it('should create Lambda with valid minimal CloudEventTrigger', () => {
      const trigger: CloudEventTrigger = {
        triggerVersion: 1,
        specversion: '1.0',
        type: 'v1.test.vercel.com',
        httpBinding: {
          mode: 'structured',
        },
      };

      const lambda = new Lambda({
        files,
        handler: 'index.handler',
        runtime: 'nodejs18.x',
        experimentalTriggers: [trigger],
      });

      expect(lambda.experimentalTriggers).toEqual([trigger]);
      expect(lambda.experimentalTriggers![0].triggerVersion).toBe(1);
      expect(lambda.experimentalTriggers![0].specversion).toBe('1.0');
      expect(lambda.experimentalTriggers![0].type).toBe('v1.test.vercel.com');
      expect(lambda.experimentalTriggers![0].httpBinding.mode).toBe(
        'structured'
      );
    });

    it('should create Lambda with CloudEventTrigger including method and pathname', () => {
      const trigger: CloudEventTrigger = {
        triggerVersion: 1,
        specversion: '1.0',
        type: 'v1.pubsub.vercel.com',
        httpBinding: {
          mode: 'structured',
          method: 'POST',
          pathname: '/webhooks/pubsub',
        },
      };

      const lambda = new Lambda({
        files,
        handler: 'index.handler',
        runtime: 'nodejs18.x',
        experimentalTriggers: [trigger],
      });

      expect(lambda.experimentalTriggers![0].httpBinding.method).toBe('POST');
      expect(lambda.experimentalTriggers![0].httpBinding.pathname).toBe(
        '/webhooks/pubsub'
      );
    });

    it('should create Lambda with multiple CloudEventTriggers', () => {
      const triggers: CloudEventTrigger[] = [
        {
          triggerVersion: 1,
          specversion: '1.0',
          type: 'v1.pubsub.vercel.com',
          httpBinding: {
            mode: 'structured',
            method: 'POST',
            pathname: '/webhooks/pubsub',
          },
        },
        {
          triggerVersion: 1,
          specversion: '1.0',
          type: 'v1.health.vercel.com',
          httpBinding: {
            mode: 'structured',
            method: 'GET',
            pathname: '/health',
          },
        },
      ];

      const lambda = new Lambda({
        files,
        handler: 'index.handler',
        runtime: 'nodejs18.x',
        experimentalTriggers: triggers,
      });

      expect(lambda.experimentalTriggers).toHaveLength(2);
      expect(lambda.experimentalTriggers![0].type).toBe('v1.pubsub.vercel.com');
      expect(lambda.experimentalTriggers![1].type).toBe('v1.health.vercel.com');
    });

    it('should support GET, POST, and HEAD methods', () => {
      const methods: ('GET' | 'POST' | 'HEAD')[] = ['GET', 'POST', 'HEAD'];

      methods.forEach(method => {
        const trigger: CloudEventTrigger = {
          triggerVersion: 1,
          specversion: '1.0',
          type: `v1.${method.toLowerCase()}.vercel.com`,
          httpBinding: {
            mode: 'structured',
            method,
            pathname: `/${method.toLowerCase()}`,
          },
        };

        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs18.x',
              experimentalTriggers: [trigger],
            })
        ).not.toThrow();
      });
    });

    describe('Validation Errors', () => {
      it('should throw error for invalid triggerVersion', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs18.x',
              experimentalTriggers: [
                {
                  triggerVersion: 2 as any,
                  specversion: '1.0',
                  type: 'v1.test.vercel.com',
                  httpBinding: { mode: 'structured' },
                },
              ],
            })
        ).toThrow('"experimentalTriggers[0]".triggerVersion must be 1');
      });

      it('should throw error for invalid specversion', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs18.x',
              experimentalTriggers: [
                {
                  triggerVersion: 1,
                  specversion: '2.0' as any,
                  type: 'v1.test.vercel.com',
                  httpBinding: { mode: 'structured' },
                },
              ],
            })
        ).toThrow('"experimentalTriggers[0]".specversion must be "1.0"');
      });

      it('should throw error for missing type', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs18.x',
              experimentalTriggers: [
                {
                  triggerVersion: 1,
                  specversion: '1.0',
                  type: '',
                  httpBinding: { mode: 'structured' },
                },
              ],
            })
        ).toThrow('"experimentalTriggers[0]".type cannot be empty');
      });

      it('should throw error for invalid httpBinding mode', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs18.x',
              experimentalTriggers: [
                {
                  triggerVersion: 1,
                  specversion: '1.0',
                  type: 'v1.test.vercel.com',
                  httpBinding: { mode: 'binary' as any },
                },
              ],
            })
        ).toThrow(
          '"experimentalTriggers[0]".httpBinding.mode must be "structured"'
        );
      });

      it('should throw error for invalid HTTP method', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs18.x',
              experimentalTriggers: [
                {
                  triggerVersion: 1,
                  specversion: '1.0',
                  type: 'v1.test.vercel.com',
                  httpBinding: {
                    mode: 'structured',
                    method: 'PUT' as any,
                  },
                },
              ],
            })
        ).toThrow(
          '"experimentalTriggers[0]".httpBinding.method must be one of: GET, POST, HEAD'
        );
      });

      it('should throw error for invalid pathname format', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs18.x',
              experimentalTriggers: [
                {
                  triggerVersion: 1,
                  specversion: '1.0',
                  type: 'v1.test.vercel.com',
                  httpBinding: {
                    mode: 'structured',
                    pathname: 'invalid-path',
                  },
                },
              ],
            })
        ).toThrow(
          '"experimentalTriggers[0]".httpBinding.pathname must start with \'/\''
        );
      });

      it('should throw error for empty pathname', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs18.x',
              experimentalTriggers: [
                {
                  triggerVersion: 1,
                  specversion: '1.0',
                  type: 'v1.test.vercel.com',
                  httpBinding: {
                    mode: 'structured',
                    pathname: '',
                  },
                },
              ],
            })
        ).toThrow(
          '"experimentalTriggers[0]".httpBinding.pathname cannot be empty'
        );
      });

      it('should throw error for missing httpBinding', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs18.x',
              experimentalTriggers: [
                {
                  triggerVersion: 1,
                  specversion: '1.0',
                  type: 'v1.test.vercel.com',
                  httpBinding: null as any,
                },
              ],
            })
        ).toThrow(
          '"experimentalTriggers[0]".httpBinding is required and must be an object'
        );
      });

      it('should throw error for non-array experimentalTriggers', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs18.x',
              experimentalTriggers: 'invalid' as any,
            })
        ).toThrow('"experimentalTriggers" is not an Array');
      });

      it('should throw error for non-object trigger', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs18.x',
              experimentalTriggers: ['invalid'] as any,
            })
        ).toThrow('"experimentalTriggers[0]" is not an object');
      });
    });

    describe('Edge Cases', () => {
      it('should work without experimentalTriggers', () => {
        const lambda = new Lambda({
          files,
          handler: 'index.handler',
          runtime: 'nodejs18.x',
        });

        expect(lambda.experimentalTriggers).toBeUndefined();
      });

      it('should work with empty experimentalTriggers array', () => {
        const lambda = new Lambda({
          files,
          handler: 'index.handler',
          runtime: 'nodejs18.x',
          experimentalTriggers: [],
        });

        expect(lambda.experimentalTriggers).toEqual([]);
      });

      it('should handle valid pathnames with various formats', () => {
        const validPathnames = [
          '/',
          '/webhook',
          '/api/v1/events',
          '/webhooks/github',
          '/health-check',
          '/events/pubsub/messages',
        ];

        validPathnames.forEach(pathname => {
          expect(
            () =>
              new Lambda({
                files,
                handler: 'index.handler',
                runtime: 'nodejs18.x',
                experimentalTriggers: [
                  {
                    triggerVersion: 1,
                    specversion: '1.0',
                    type: 'v1.test.vercel.com',
                    httpBinding: {
                      mode: 'structured',
                      pathname,
                    },
                  },
                ],
              })
          ).not.toThrow();
        });
      });
    });

    describe('Type Safety', () => {
      it('should preserve trigger properties correctly', () => {
        const originalTrigger: CloudEventTrigger = {
          triggerVersion: 1,
          specversion: '1.0',
          type: 'v1.complex.vercel.com',
          httpBinding: {
            mode: 'structured',
            method: 'HEAD',
            pathname: '/api/health',
          },
        };

        const lambda = new Lambda({
          files,
          handler: 'index.handler',
          runtime: 'nodejs18.x',
          experimentalTriggers: [originalTrigger],
        });

        const storedTrigger = lambda.experimentalTriggers![0];
        expect(storedTrigger).toEqual(originalTrigger);
        expect(storedTrigger.triggerVersion).toBe(1);
        expect(storedTrigger.specversion).toBe('1.0');
        expect(storedTrigger.type).toBe('v1.complex.vercel.com');
        expect(storedTrigger.httpBinding.mode).toBe('structured');
        expect(storedTrigger.httpBinding.method).toBe('HEAD');
        expect(storedTrigger.httpBinding.pathname).toBe('/api/health');
      });
    });
  });
});
