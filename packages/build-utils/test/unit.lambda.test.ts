import path from 'path';
import { tmpdir } from 'os';
import fs from 'fs-extra';
import { createZip, Lambda, TriggerEvent } from '../src/lambda';
import type { Files } from '../src/types';
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

  describe('TriggerEvent', () => {
    const files: Files = {};

    it('should create Lambda with minimal queue trigger', () => {
      const trigger: TriggerEvent = {
        type: 'queue/v1beta',
        topic: 'user-events',
        consumer: 'webhook-processors',
      };

      const lambda = new Lambda({
        files,
        handler: 'index.handler',
        runtime: 'nodejs22.x',
        experimentalTriggers: [trigger],
      });

      expect(lambda.experimentalTriggers).toEqual([trigger]);
      expect(lambda.experimentalTriggers![0].type).toBe('queue/v1beta');
      expect(lambda.experimentalTriggers![0].topic).toBe('user-events');
      expect(lambda.experimentalTriggers![0].consumer).toBe(
        'webhook-processors'
      );
    });

    it('should create Lambda with complete queue trigger configuration', () => {
      const trigger: TriggerEvent = {
        type: 'queue/v1beta',
        topic: 'system-events',
        consumer: 'system-processors',
        maxDeliveries: 3,
        retryAfterSeconds: 10,
        initialDelaySeconds: 60,
      };

      const lambda = new Lambda({
        files,
        handler: 'index.handler',
        runtime: 'nodejs22.x',
        experimentalTriggers: [trigger],
      });

      expect(lambda.experimentalTriggers![0].type).toBe('queue/v1beta');
      expect(lambda.experimentalTriggers![0].topic).toBe('system-events');
      expect(lambda.experimentalTriggers![0].consumer).toBe(
        'system-processors'
      );
      expect(lambda.experimentalTriggers![0].maxDeliveries).toBe(3);
      expect(lambda.experimentalTriggers![0].retryAfterSeconds).toBe(10);
      expect(lambda.experimentalTriggers![0].initialDelaySeconds).toBe(60);
    });

    it('should create Lambda with multiple queue triggers', () => {
      const triggers: TriggerEvent[] = [
        {
          type: 'queue/v1beta',
          topic: 'user-events',
          consumer: 'user-processors',
        },
        {
          type: 'queue/v1beta',
          topic: 'system-events',
          consumer: 'system-processors',
          maxDeliveries: 5,
        },
      ];

      const lambda = new Lambda({
        files,
        handler: 'index.handler',
        runtime: 'nodejs22.x',
        experimentalTriggers: triggers,
      });

      expect(lambda.experimentalTriggers).toHaveLength(2);
      expect(lambda.experimentalTriggers![0].topic).toBe('user-events');
      expect(lambda.experimentalTriggers![1].topic).toBe('system-events');
      expect(lambda.experimentalTriggers![1].maxDeliveries).toBe(5);
    });

    describe('Validation Errors', () => {
      it('should throw error for invalid type', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs22.x',
              experimentalTriggers: [
                {
                  type: 'invalid.type' as any,
                  topic: 'test-topic',
                  consumer: 'test-consumer',
                },
              ],
            })
        ).toThrow('"experimentalTriggers[0]".type must be "queue/v1beta"');
      });

      it('should throw error for missing topic', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs22.x',
              experimentalTriggers: [
                {
                  type: 'queue/v1beta',
                  topic: '',
                  consumer: 'test-consumer',
                },
              ],
            })
        ).toThrow('"experimentalTriggers[0]".topic cannot be empty');
      });

      it('should throw error for missing consumer', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs22.x',
              experimentalTriggers: [
                {
                  type: 'queue/v1beta',
                  topic: 'test-topic',
                  consumer: '',
                },
              ],
            })
        ).toThrow('"experimentalTriggers[0]".consumer cannot be empty');
      });

      it('should throw error for non-array experimentalTriggers', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs22.x',
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
              runtime: 'nodejs22.x',
              experimentalTriggers: ['invalid'] as any,
            })
        ).toThrow('"experimentalTriggers[0]" is not an object');
      });

      it('should throw error for invalid maxDeliveries', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs22.x',
              experimentalTriggers: [
                {
                  type: 'queue/v1beta',
                  topic: 'test-topic',
                  consumer: 'test-consumer',
                  maxDeliveries: 0,
                },
              ],
            })
        ).toThrow('"experimentalTriggers[0]".maxDeliveries must be at least 1');
      });

      it('should throw error for invalid retryAfterSeconds', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs22.x',
              experimentalTriggers: [
                {
                  type: 'queue/v1beta',
                  topic: 'test-topic',
                  consumer: 'test-consumer',
                  retryAfterSeconds: 0,
                },
              ],
            })
        ).toThrow(
          '"experimentalTriggers[0]".retryAfterSeconds must be a positive number'
        );
      });

      it('should throw error for invalid initialDelaySeconds', () => {
        expect(
          () =>
            new Lambda({
              files,
              handler: 'index.handler',
              runtime: 'nodejs22.x',
              experimentalTriggers: [
                {
                  type: 'queue/v1beta',
                  topic: 'test-topic',
                  consumer: 'test-consumer',
                  initialDelaySeconds: -1,
                },
              ],
            })
        ).toThrow(
          '"experimentalTriggers[0]".initialDelaySeconds must be a non-negative number'
        );
      });
    });

    describe('Edge Cases', () => {
      it('should work without experimentalTriggers', () => {
        const lambda = new Lambda({
          files,
          handler: 'index.handler',
          runtime: 'nodejs22.x',
        });

        expect(lambda.experimentalTriggers).toBeUndefined();
      });

      it('should work with empty experimentalTriggers array', () => {
        const lambda = new Lambda({
          files,
          handler: 'index.handler',
          runtime: 'nodejs22.x',
          experimentalTriggers: [],
        });

        expect(lambda.experimentalTriggers).toEqual([]);
      });

      it('should work with zero initialDelaySeconds', () => {
        const trigger: TriggerEvent = {
          type: 'queue/v1beta',
          topic: 'immediate-events',
          consumer: 'immediate-processors',
          initialDelaySeconds: 0,
        };

        const lambda = new Lambda({
          files,
          handler: 'index.handler',
          runtime: 'nodejs22.x',
          experimentalTriggers: [trigger],
        });

        expect(lambda.experimentalTriggers![0].initialDelaySeconds).toBe(0);
      });
    });
  });
});
