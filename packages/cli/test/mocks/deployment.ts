import { URL } from 'url';
import chance from 'chance';
import { client } from './client';
import { Build, Deployment, User } from '@vercel-internals/types';
import type { Request, Response } from 'express';
import { defaultProject } from './project';

let deployments = new Map<string, Deployment>();
let deploymentBuilds = new Map<Deployment, Build[]>();
let alreadySetupDeplomentEndpoints = false;

/**
 * Initializes a mock deployment and wires up the deployment endpoint
 * scenarios.
 */
export function useDeployment({
  creator,
  state = 'READY',
  createdAt,
  project = defaultProject,
  target = 'production',
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
  project: any; // FIX ME: Use `Project` once PR #9956 is merged
  target?: Deployment['target'];
}) {
  setupDeploymentEndpoints();

  createdAt = createdAt || Date.now();
  const url = new URL(chance().url());
  const name = chance().name();
  const id = `dpl_${chance().guid()}`;

  const deployment: Deployment = {
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
    projectId: project.id,
    public: false,
    ready: createdAt + 30000,
    readyState: state,
    regions: [],
    routes: [],
    status: state,
    target,
    type: 'LAMBDAS',
    url: url.hostname,
    version: 2,
  };

  deployments.set(deployment.id, deployment);
  deploymentBuilds.set(deployment, []);

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
  deployments = new Map();
  deploymentBuilds = new Map();
  alreadySetupDeplomentEndpoints = false;
});

function setupDeploymentEndpoints(): void {
  if (alreadySetupDeplomentEndpoints) {
    return;
  }

  alreadySetupDeplomentEndpoints = true;

  client.scenario.get('/v13/deployments/:id', (req, res) => {
    const { id } = req.params;
    const { url } = req.query;
    let deployment;

    if (id === 'get') {
      if (typeof url !== 'string') {
        res.statusCode = 400;
        return res.json({ error: { code: 'bad_request' } });
      }
      deployment = Array.from(deployments.values()).find(d => {
        return d.url === url;
      });
    } else if (id.includes('.')) {
      deployment = Array.from(deployments.values()).find(d => {
        return d.url === id;
      });
    } else {
      // lookup by ID
      deployment = deployments.get(id);
    }

    if (!deployment) {
      res.statusCode = 404;
      return res.json({
        error: { code: 'not_found', message: 'Deployment not found', id },
      });
    }

    res.json(deployment);
  });

  client.scenario.get('/v11/deployments/:id/builds', (req, res) => {
    const { id } = req.params;
    const deployment = deployments.get(id);
    if (!deployment) {
      res.statusCode = 404;
      return res.json({ error: { code: 'not_found' } });
    }
    const builds = deploymentBuilds.get(deployment);
    res.json({ builds });
  });

  function handleGetDeployments(req: Request, res: Response) {
    const currentDeployments = Array.from(deployments.values()).sort(
      (a: Deployment, b: Deployment) => {
        // sort in reverse chronological order
        return (b?.createdAt || 0) - (a?.createdAt || 0);
      }
    );

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
