import { URL } from 'url';
import chance from 'chance';
import { Deployment } from '@vercel/client';
import { client } from './client';
import { Build, User } from '../../src/types';

let deployments = new Map<string, Deployment>();
let deploymentBuilds = new Map<Deployment, Build[]>();

type State = Deployment['readyState'];

export function useDeployment({
  creator,
  state = 'READY',
}: {
  creator: Pick<User, 'id' | 'email' | 'name' | 'username'>;
  state?: State;
}) {
  const createdAt = Date.now();
  const url = new URL(chance().url());

  const deployment: Deployment = {
    id: `dpl_${chance().guid()}`,
    url: url.hostname,
    name: chance.name,
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
      email: creator.email,
      name: creator.name,
      username: creator.username,
    },
    readyState: state,
    state: state,
    ready: Date.now() + Math.floor(Math.random() * 300000),
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

  client.scenario.get('/:version/now/deployments', (req, res) => {
    const deploymentsList = Array.from(deployments.values());
    res.json({ deployments: deploymentsList });
  });
});
