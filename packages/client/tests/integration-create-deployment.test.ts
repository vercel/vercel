import { it, expect, describe, beforeEach, vi, beforeAll } from 'vitest';
import path from 'path';
import fetch_ from 'node-fetch';
import { generateNewToken } from './common';
import { Deployment } from './types';
import { createDeployment } from '../src/index';
import { isObject } from '@vercel/error-utils';
import { generateFakeFiles } from './util/generate-fake-files';

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
    let path: string;

    beforeAll(async () => {
      path = await generateFakeFiles(300, 100);
    });

    it('SPLIT_SOURCE_ARCHIVE will emit several buffers that when concatenated match the output of a single large buffer', async () => {
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
      const staticTime = new Date('2024-01-01T00:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(staticTime);

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

      expect(
        concatenatedBufferFromNormalArchiving.compare(
          concatenatedBufferFromNormalArchiving2
        )
      ).toBe(0);

      // Simulate the SPLIT_SOURCE_ARCHIVE environment variable being set
      vi.stubEnv('SPLIT_SOURCE_ARCHIVE', '1');

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

      expect(
        Buffer.concat(buffersFromChunkArchiving).compare(
          concatenatedBufferFromNormalArchiving
        )
      ).toBe(0);
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
