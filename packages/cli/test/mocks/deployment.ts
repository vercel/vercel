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
  const name = chance().name();
  const id = `dpl_${chance().guid()}`;

  const deployment: Deployment = {
    id,
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
      email: creator.email,
      name: creator.name,
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
          logo: 'https://raw.githubusercontent.com/vercel/vercel/main/packages/frameworks/logos/other.svg',
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
