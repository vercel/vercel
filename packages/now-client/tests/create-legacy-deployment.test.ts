import path from 'path';
import { generateNewToken } from './common';
import { fetch, API_DELETE_DEPLOYMENTS_LEGACY } from '../src/utils';
import { Deployment } from './types';
import { createLegacyDeployment } from '../src/index';

describe('create v1 deployment', () => {
  let deployment: Deployment | undefined;
  let token = '';

  beforeEach(async () => {
    token = await generateNewToken();
  });

  afterEach(async () => {
    if (deployment) {
      const response = await fetch(
        `${API_DELETE_DEPLOYMENTS_LEGACY}/${deployment.deploymentId ||
          deployment.uid}`,
        token,
        {
          method: 'DELETE',
        }
      );
      expect(response.status).toEqual(200);
      deployment = undefined;
    }
  });

  it('will create a v1 static deployment', async () => {
    for await (const event of createLegacyDeployment(
      {
        token,
        path: path.resolve(__dirname, 'fixtures', 'v1', 'static'),
      },
      {
        name: 'now-client-tests-v1-static',
      }
    )) {
      if (event.type === 'ready') {
        deployment = event.payload;
        if (deployment) {
          expect(deployment.readyState || deployment.state).toEqual('READY');
          break;
        }
      }
    }
  });

  it('will create a v1 npm deployment', async () => {
    for await (const event of createLegacyDeployment(
      {
        token,
        path: path.resolve(__dirname, 'fixtures', 'v1', 'npm'),
      },
      {
        name: 'now-client-tests-v1-npm',
      }
    )) {
      if (event.type === 'ready') {
        deployment = event.payload;
        if (deployment) {
          expect(deployment.readyState || deployment.state).toEqual('READY');
          break;
        }
      }
    }
  });

  it('will create a v1 Docker deployment', async () => {
    for await (const event of createLegacyDeployment(
      {
        token,
        path: path.resolve(__dirname, 'fixtures', 'v1', 'docker'),
      },
      {
        name: 'now-client-tests-v1-docker',
      }
    )) {
      if (event.type === 'ready') {
        deployment = event.payload;
        if (deployment) {
          expect(deployment.readyState || deployment.state).toEqual('READY');
          break;
        }
      }
    }
  });
});
