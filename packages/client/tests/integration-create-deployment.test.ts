import path from 'path';
import fetch_ from 'node-fetch';
import { generateNewToken } from './common';
import { Deployment } from './types';
import { createDeployment } from '../src/index';
import { isObject } from '@vercel/error-utils';
import { generateFakeFiles } from './util/generate-fake-files';
import { createGunzip } from 'zlib';
// @ts-expect-error Missing types for package
import tarStream from 'tar-stream';
import { Readable } from 'stream';
import { beforeEach, describe, expect, it } from 'vitest';

describe('create v2 deployment', () => {
  let deployment: Deployment;
  let token = '';

  beforeEach(async () => {
    token = await generateNewToken();
  });

  it('will display an empty deployment warning', async () => {
    for await (const event of createDeployment(
      {
        token,
        teamId: process.env.VERCEL_TEAM_ID,
        path: path.resolve(__dirname, 'fixtures', 'v2'),
      },
      {
        name: 'now-clien-tests-v2',
      }
    )) {
      if (event.type === 'warning') {
        expect(event.payload).toEqual('READY');
      }

      if (event.type === 'ready') {
        deployment = event.payload;
        break;
      }
    }
  });

  it('will report correct file count event', async () => {
    for await (const event of createDeployment(
      {
        token,
        teamId: process.env.VERCEL_TEAM_ID,
        path: path.resolve(__dirname, 'fixtures', 'v2'),
      },
      {
        name: 'now-client-tests-v2',
      }
    )) {
      if (event.type === 'file-count') {
        expect(event.payload.total).toEqual(0);
      }

      if (event.type === 'ready') {
        deployment = event.payload;
        break;
      }
    }
  });

  it('will create a v2 deployment', async () => {
    for await (const event of createDeployment(
      {
        token,
        teamId: process.env.VERCEL_TEAM_ID,
        path: path.resolve(__dirname, 'fixtures', 'v2'),
      },
      {
        name: 'now-client-tests-v2',
      }
    )) {
      if (event.type === 'ready') {
        deployment = event.payload;
        expect(deployment.readyState).toEqual('READY');
        break;
      }
    }
  });

  describe('using --archive=tgz', () => {
    it('SPLIT_SOURCE_ARCHIVE will emit several buffers that when concatenated match the output of a single large buffer', async () => {
      const oldEnv = process.env;
      /**
       * Since the tar process creates metadata which makes the output non-deterministic,
       * we extract the filename and content from the tar into an object and compare that.
       */
      const extractGzippedTarWithoutMetadata = async (buffer: Buffer) => {
        const gunzippedBuffer = await new Promise<Buffer>((resolve, reject) => {
          const gunzip = createGunzip();
          const buffers: Buffer[] = [];
          gunzip.on('data', buffers.push.bind(buffers));
          gunzip.on('end', () => {
            resolve(Buffer.concat(buffers));
          });
          gunzip.on('error', reject);
          gunzip.end(buffer);
        });

        return new Promise<any>((resolve, reject) => {
          const extract = tarStream.extract();
          const fileMap: Record<string, string> = {};
          extract.on('entry', (header: any, stream: any, next: any) => {
            const chunks: any[] = [];
            stream.on('data', (chunk: any) => chunks.push(chunk));
            stream.on('end', () => {
              const content = Buffer.concat(chunks).toString('utf8');
              fileMap[header.name] = content;
              next();
            });

            stream.resume(); // Ensure the stream ends
          });
          extract.on('error', reject);

          extract.on('finish', () => {
            resolve(fileMap);
          });
          Readable.from(gunzippedBuffer).pipe(extract);
        });
      };

      // TODO: the limit in packages/build-utils/src/fs/stream-to-buffer.ts
      // is artificially low, so we need to spy on it to provide that low value
      // so that the real value can be 100MB
      const path = generateFakeFiles(1000, 100);
      const args: Parameters<typeof createDeployment> = [
        {
          token,
          teamId: process.env.VERCEL_TEAM_ID,
          path,
          archive: 'tgz',
        },
        {
          name: 'some-project',
        },
      ];

      const buffersFromNormalArchiving: Buffer[] = [];
      for await (const event of createDeployment(...args)) {
        if (event.type === 'hashes-calculated') {
          const item = Object.values(event.payload)[0];
          if (isObject(item) && 'data' in item && Buffer.isBuffer(item.data)) {
            buffersFromNormalArchiving.push(item.data);
          }
        }
      }
      const concatenatedBufferFromNormalArchiving = Buffer.concat(
        buffersFromNormalArchiving
      );

      const buffersFromNormalArchiving2: Buffer[] = [];
      for await (const event of createDeployment(...args)) {
        if (event.type === 'hashes-calculated') {
          const item = Object.values(event.payload)[0];
          if (isObject(item) && 'data' in item && Buffer.isBuffer(item.data)) {
            buffersFromNormalArchiving2.push(item.data);
          }
        }
      }
      const concatenatedBufferFromNormalArchiving2 = Buffer.concat(
        buffersFromNormalArchiving2
      );

      // Compare 2 runs of the non-split archive to ensure extractGzippedTarWithoutMetadata is deterministic
      expect(
        await extractGzippedTarWithoutMetadata(
          concatenatedBufferFromNormalArchiving
        )
      ).toMatchObject(
        await extractGzippedTarWithoutMetadata(
          concatenatedBufferFromNormalArchiving2
        )
      );

      process.env = {
        ...oldEnv,
        SPLIT_SOURCE_ARCHIVE: '1',
      };
      const buffersFromChunkArchiving: Buffer[] = [];
      for await (const event of createDeployment(...args)) {
        if (event.type === 'hashes-calculated') {
          Object.values(event.payload).forEach(item => {
            if (
              isObject(item) &&
              'data' in item &&
              Buffer.isBuffer(item.data)
            ) {
              buffersFromChunkArchiving.push(item.data);
            }
          });
        }
      }

      // Want to ensure that the test setup creates a large enough source archive
      // so that it needs to be split into multiple parts
      expect(buffersFromChunkArchiving.length).toBeGreaterThan(1);
      const concatenatedBufferFromChunkArchiving = Buffer.concat(
        buffersFromChunkArchiving
      );
      expect(
        await extractGzippedTarWithoutMetadata(
          concatenatedBufferFromNormalArchiving
        )
      ).toMatchObject(
        await extractGzippedTarWithoutMetadata(
          concatenatedBufferFromChunkArchiving
        )
      );

      process.env = oldEnv;
    });
  });

  it('will create a v2 deployment with correct file permissions', async () => {
    let error = null;
    for await (const event of createDeployment(
      {
        token,
        teamId: process.env.VERCEL_TEAM_ID,
        path: path.resolve(__dirname, 'fixtures', 'v2-file-permissions'),
        skipAutoDetectionConfirmation: true,
      },
      {
        name: 'now-client-tests-v2',
        projectSettings: {
          buildCommand: null,
          devCommand: null,
          outputDirectory: null,
        },
      }
    )) {
      if (event.type === 'ready') {
        deployment = event.payload;
        break;
      } else if (event.type === 'error') {
        error = event.payload;
        console.error(error.message);
        break;
      }
    }

    expect(error).toBe(null);
    expect(deployment.readyState).toEqual('READY');

    const url = `https://${deployment.url}/api/index.js`;
    console.log('testing url ' + url);
    const response = await fetch_(url);
    const text = await response.text();
    expect(deployment.readyState).toEqual('READY');
    expect(text).toContain('executed bash script');
  });

  it('will create a v2 deployment and ignore files specified in .nowignore', async () => {
    let error = null;
    for await (const event of createDeployment(
      {
        token,
        teamId: process.env.VERCEL_TEAM_ID,
        path: path.resolve(__dirname, 'fixtures', 'nowignore'),
        skipAutoDetectionConfirmation: true,
      },
      {
        name: 'now-client-tests-v2',
        projectSettings: {
          buildCommand: null,
          devCommand: null,
          outputDirectory: null,
        },
      }
    )) {
      if (event.type === 'ready') {
        deployment = event.payload;
        break;
      } else if (event.type === 'error') {
        error = event.payload;
        console.error(error.message);
        break;
      }
    }

    expect(error).toBe(null);
    expect(deployment.readyState).toEqual('READY');

    const index = await fetch_(`https://${deployment.url}`);
    expect(index.status).toBe(200);
    expect(await index.text()).toBe('Hello World!');

    const ignore1 = await fetch_(`https://${deployment.url}/ignore.txt`);
    expect(ignore1.status).toBe(404);

    const ignore2 = await fetch_(`https://${deployment.url}/folder/ignore.txt`);
    expect(ignore2.status).toBe(404);

    const ignore3 = await fetch_(
      `https://${deployment.url}/node_modules/ignore.txt`
    );
    expect(ignore3.status).toBe(404);
  });
});
