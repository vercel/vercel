import path from 'path';
import fetch_ from 'node-fetch';
import { generateNewToken } from './common';
import { Deployment } from './types';
import { createDeployment } from '../src/index';
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
