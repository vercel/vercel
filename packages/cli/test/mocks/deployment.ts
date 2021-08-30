import { URL } from 'url';
import chance from 'chance';
import { Deployment } from '@vercel/client';
import { client } from './client';
import { Build, User } from '../../src/types';

let deployments = new Map<string, Deployment>();
let deploymentBuilds = new Map<Deployment, Build[]>();

export function useDeployment({ creator }: { creator: Pick<User, 'uid'> }) {
  const createdAt = Date.now();
  const url = new URL(chance().url());
  const deployment: Deployment = {
    id: `dpl_${chance().guid()}`,
    url: url.hostname,
    name: '',
    meta: {},
    regions: [],
    routes: [],
    plan: 'hobby',
    public: false,
    version: 2,
    createdAt,
    createdIn: 'sfo1',
    ownerId: creator.uid,
    readyState: 'READY',
    env: {},
    build: { env: {} },
    target: 'production',
    alias: [],
    aliasAssigned: true,
    aliasError: null,
  };

  deployments.set(deployment.id, deployment);
  deploymentBuilds.set(deployment, []);

  return deployment;
}

beforeEach(() => {
  deployments = new Map();
  deploymentBuilds = new Map();

  client.scenario.get('/:version/deployments/:id', (req, res) => {
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

  client.scenario.get('/:version/deployments/:id/builds', (req, res) => {
    const { id } = req.params;
    const deployment = deployments.get(id);
    if (!deployment) {
      res.statusCode = 404;
      return res.json({ error: { code: 'not_found' } });
    }
    const builds = deploymentBuilds.get(deployment);
    res.json({ builds });
  });
});
