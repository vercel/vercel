import { type Mock, beforeEach } from 'vitest';
import { URL } from 'url';
import chance from 'chance';
import { client } from './client';
import type { Build, Deployment, User } from '@vercel-internals/types';
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
  project?: any; // FIX ME: Use `Project` once PR #9956 is merged
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

export function useBuildLogs({
  deployment,
  logProducer,
}: {
  deployment: Deployment;
  logProducer: () => AsyncGenerator<object, void, unknown>;
}) {
  client.scenario.get(
    `/v3/now/deployments/${deployment.id}/events`,
    async (req, res) => {
      for await (const log of logProducer()) {
        res.write(JSON.stringify(log) + '\n');
      }
      res.end();
    }
  );
}

export function useRuntimeLogs({
  deployment,
  logProducer,
  spy,
}: {
  deployment: Deployment;
  logProducer: () => AsyncGenerator<object, void, unknown>;
  spy?: Mock;
}) {
  client.scenario.get(
    `/v1/projects/${deployment.projectId}/deployments/${deployment.id}/runtime-logs`,
    async (req, res) => {
      spy?.(req.path, req.query);
      for await (const log of logProducer()) {
        res.write(JSON.stringify(log) + '\n');
      }
      res.end();
    }
  );
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

  client.scenario.get('/:version/deployments/:id/aliases', (req, res) => {
    const limit =
      typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json({
      aliases: [],
      pagination: { count: limit, total: limit, page: 1, pages: 1 },
    });
  });

  function handleGetDeployments(req: Request, res: Response) {
    let currentDeployments = Array.from(deployments.values()).sort(
      (a: Deployment, b: Deployment) => {
        // sort in reverse chronological order
        return (b?.createdAt || 0) - (a?.createdAt || 0);
      }
    );

    // Filter by state if provided
    const stateFilter = req.query.state;
    if (stateFilter && typeof stateFilter === 'string') {
      const allowedStates = stateFilter.split(',').map(s => s.trim());
      currentDeployments = currentDeployments.filter(deployment =>
        allowedStates.includes(deployment.readyState || '')
      );
    }

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
