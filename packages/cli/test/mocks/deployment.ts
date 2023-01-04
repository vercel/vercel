import { URL } from 'url';
import chance from 'chance';
import { client } from './client';
import {
  Build,
  Deployment,
  DeploymentV5,
  DeploymentV13,
  User,
} from '../../src/types';
import type { Request, Response } from 'express';

let deployments: {
  [apiVersion: string]: Map<string, Deployment>;
} = {
  v5: new Map<string, DeploymentV5>(),
  v13: new Map<string, DeploymentV13>(),
};
let deploymentBuilds: {
  [apiVersion: string]: Map<Deployment, Build[]>;
} = {
  v5: new Map<DeploymentV5, Build[]>(),
  v13: new Map<DeploymentV13, Build[]>(),
};
let alreadySetupDeplomentEndpoints = false;

type State = DeploymentV13['readyState'];

/**
 * Initializes a v5 deployment.
 */
export function useDeployment({
  creator,
  state = 'READY',
  createdAt,
}: {
  creator: Pick<User, 'id' | 'email' | 'name' | 'username'>;
  state?: State;
  createdAt?: number;
}) {
  setupDeploymentEndpoints('v5');

  createdAt = createdAt || Date.now();
  const url = new URL(chance().url());
  const name = chance().name();
  const id = `dpl_${chance().guid()}`;

  const deployment: DeploymentV5 = {
    id,
    uid: id,
    url: url.hostname,
    name,
    meta: {},
    regions: [],
    routes: [],
    plan: 'hobby',
    public: false,
    version: 2,
    createdAt,
    createdIn: 'sfo1',
    buildingAt: Date.now(),
    ownerId: creator.id,
    creator: {
      uid: creator.id,
      username: creator.username,
    },
    readyState: state,
    state: state,
    ready: createdAt + 30000,
    env: {},
    build: { env: {} },
    target: 'production',
    alias: [],
    aliasAssigned: true,
    aliasError: null,
    inspectorUrl: `https://vercel.com/${creator.name}/${id}`,
    type: 'LAMBDAS',
  };

  deployments.v5.set(deployment.id, deployment);
  deploymentBuilds.v5.set(deployment, []);

  return deployment;
}

/**
 * Initializes a v13 deployment.
 */
export function useDeploymentV13({
  creator,
  state = 'READY',
  createdAt,
}: {
  creator: Pick<User, 'id' | 'email' | 'name' | 'username'>;
  state?:
    | 'BUILDING'
    | 'ERROR'
    | 'INITIALIZING'
    | 'QUEUED'
    | 'READY'
    | 'CANCELED';
  createdAt?: number;
}) {
  setupDeploymentEndpoints('v13');

  createdAt = createdAt || Date.now();
  const url = new URL(chance().url());
  const name = chance().name();
  const id = `dpl_${chance().guid()}`;

  const deployment: DeploymentV13 = {
    alias: [],
    aliasAssigned: true,
    aliasError: null,
    build: { env: [] },
    buildingAt: Date.now(),
    createdAt,
    createdIn: 'sfo1',
    creator: {
      uid: creator.id,
      username: creator.username,
    },
    env: [],
    id,
    inspectorUrl: `https://vercel.com/${creator.name}/${id}`,
    meta: {},
    name,
    ownerId: creator.id,
    plan: 'hobby',
    public: false,
    ready: createdAt + 30000,
    readyState: state,
    regions: [],
    routes: [],
    status: state,
    target: 'production',
    type: 'LAMBDAS',
    url: url.hostname,
    version: 2,
  };

  deployments.v13.set(deployment.id, deployment);
  deploymentBuilds.v13.set(deployment, []);

  return deployment;
}

export function useDeploymentMissingProjectSettings() {
  client.scenario.post('/:version/deployments', (_req, res) => {
    res.status(400).json({
      error: {
        code: 'missing_project_settings',
        message:
          'The `projectSettings` object is required for new projects, but is missing in the deployment payload',
        framework: {
          name: 'Other',
          slug: null,
          logo: 'https://api-frameworks.vercel.sh/framework-logos/other.svg',
          description: 'No framework or an unoptimized framework.',
          settings: {
            installCommand: {
              placeholder: '`yarn install`, `pnpm install`, or `npm install`',
            },
            buildCommand: {
              placeholder: '`npm run vercel-build` or `npm run build`',
              value: null,
            },
            devCommand: { placeholder: 'None', value: null },
            outputDirectory: { placeholder: '`public` if it exists, or `.`' },
          },
        },
        projectSettings: {
          devCommand: null,
          installCommand: null,
          buildCommand: null,
          outputDirectory: null,
          rootDirectory: null,
          framework: null,
        },
      },
    });
  });
}

beforeEach(() => {
  deployments.v5 = new Map();
  deployments.v13 = new Map();
  deploymentBuilds.v5 = new Map();
  deploymentBuilds.v13 = new Map();
  alreadySetupDeplomentEndpoints = false;
});

function setupDeploymentEndpoints(apiVersion: string): void {
  if (alreadySetupDeplomentEndpoints) {
    return;
  }

  alreadySetupDeplomentEndpoints = true;

  client.scenario.get('/:version/deployments/:id', (req, res) => {
    const { id } = req.params;
    const { url } = req.query;
    let deployment;
    if (id === 'get') {
      if (typeof url !== 'string') {
        res.statusCode = 400;
        return res.json({ error: { code: 'bad_request' } });
      }
      deployment = Array.from(deployments[apiVersion].values()).find(d => {
        return d.url === url;
      });
    } else {
      // lookup by ID
      deployment = deployments[apiVersion].get(id);
    }
    if (!deployment) {
      res.statusCode = 404;
      return res.json({
        error: { code: 'not_found', message: 'Deployment not found', id },
      });
    }
    res.json(deployment);
  });

  if (apiVersion === 'v5') {
    client.scenario.get('/v5/deployments/:id', (req, res) => {
      const { id } = req.params;
      const { url } = req.query;
      let deployment;
      if (id === 'get') {
        if (typeof url !== 'string') {
          res.statusCode = 400;
          return res.json({ error: { code: 'bad_request' } });
        }
        deployment = Array.from(deployments[apiVersion].values()).find(d => {
          return d.url === url;
        });
      } else {
        // lookup by ID
        deployment = deployments[apiVersion].get(id);
      }
      if (!deployment) {
        res.statusCode = 404;
        return res.json({
          error: { code: 'not_found', message: 'Deployment not found', id },
        });
      }
      res.json({
        uid: deployment.id,
        url: deployment.url,
        name: '',
        type: 'LAMBDAS',
        state: 'READY',
        version: deployment.version,
        created: deployment.createdAt,
        ready: deployment.ready,
        buildingAt: deployment.buildingAt,
        creator: {
          uid: deployment.creator?.uid,
          username: deployment.creator?.username,
        },
        target: deployment.target,
        ownerId: undefined, // ?
        projectId: undefined, // ?
        inspectorUrl: deployment.inspectorUrl,
        meta: {},
        alias: deployment.alias,
      });
    });
  }

  // v13 deployment builds endpoint
  if (apiVersion === 'v13') {
    client.scenario.get('/v13/deployments/:id/builds', (req, res) => {
      const { id } = req.params;
      const deployment = deployments[apiVersion].get(id);
      if (!deployment) {
        res.statusCode = 404;
        return res.json({ error: { code: 'not_found' } });
      }
      const builds = deploymentBuilds[apiVersion].get(deployment);
      res.json({ builds });
    });
  }

  // v5 deployment builds endpoint
  client.scenario.get('/:version/deployments/:id/builds', (req, res) => {
    const { id } = req.params;
    const deployment = deployments[apiVersion].get(id);
    if (!deployment) {
      res.statusCode = 404;
      return res.json({ error: { code: 'not_found' } });
    }
    const builds = deploymentBuilds[apiVersion].get(deployment);
    res.json({ builds });
  });

  function handleGetDeployments(req: Request, res: Response) {
    const currentDeployments = Array.from(
      deployments[apiVersion].values()
    ).sort((a: Deployment, b: Deployment) => {
      // sort in reverse chronological order
      return (b?.createdAt || 0) - (a?.createdAt || 0);
    });

    res.json({
      pagination: {
        count: currentDeployments.length,
      },
      deployments: currentDeployments,
    });
  }
  client.scenario.get('/:version/now/deployments', handleGetDeployments);
  client.scenario.get('/:version/deployments', handleGetDeployments);
}
