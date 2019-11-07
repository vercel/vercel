import path from 'path';
import fetch_ from 'node-fetch';
import { generateNewToken } from './common';
import { fetch, API_DEPLOYMENTS } from '../src/utils';
import { Deployment } from './types';
import { createDeployment } from '../src/index';

describe('create v2 deployment', () => {
  let deployment: Deployment;
  let token = '';

  beforeEach(async () => {
    token = await generateNewToken();
  });

  afterEach(async () => {
    if (deployment) {
      const response = await fetch(
        `${API_DEPLOYMENTS}/${deployment.id}`,
        token,
        {
          method: 'DELETE',
        }
      );
      expect(response.status).toEqual(200);
    }
  });

  it('will display an empty deployment warning', async () => {
    for await (const event of createDeployment(
      path.resolve(__dirname, 'fixtures', 'v2'),
      {
        token,
        name: 'now-client-tests-v2',
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
      path.resolve(__dirname, 'fixtures', 'v2'),
      {
        token,
        name: 'now-client-tests-v2',
      }
    )) {
      if (event.type === 'file_count') {
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
      path.resolve(__dirname, 'fixtures', 'v2'),
      {
        token,
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

  it('will create a v2 deployment and ignore files specified in .nowignore', async () => {
    for await (const event of createDeployment(
      path.resolve(__dirname, 'fixtures', 'nowignore'),
      {
        token,
        name: 'now-client-tests-v2-ignore',
      }
    )) {
      if (event.type === 'ready') {
        deployment = event.payload;
        expect(deployment.readyState).toEqual('READY');
        break;
      }
    }

    const index = await fetch_(`https://${deployment.url}`);
    expect(index.status).toBe(200);
    expect(await index.text()).toBe('Hello World!');

    const ignore1 = await fetch_(`https://${deployment.url}/ignore.txt`);
    expect(ignore1.status).toBe(404);

    const ignore2 = await fetch_(`https://${deployment.url}/folder/ignore.txt`);
    expect(ignore2.status).toBe(404);
  });
});
