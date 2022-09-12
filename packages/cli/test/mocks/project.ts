import { client } from './client';
import { Project } from '../../src/types';
import { formatProvider } from '../../src/util/git/connect-git-provider';

const envs = [
  {
    type: 'encrypted',
    id: '781dt89g8r2h789g',
    key: 'REDIS_CONNECTION_STRING',
    value: 'redis://abc123@redis.example.com:6379',
    target: ['production', 'preview'],
    gitBranch: null,
    configurationId: null,
    updatedAt: 1557241361455,
    createdAt: 1557241361455,
  },
  {
    type: 'encrypted',
    id: 'r124t6frtu25df16',
    key: 'SQL_CONNECTION_STRING',
    value: 'Server=sql.example.com;Database=app;Uid=root;Pwd=P455W0RD;',
    target: ['production'],
    gitBranch: null,
    configurationId: null,
    updatedAt: 1557241361445,
    createdAt: 1557241361445,
  },
  {
    type: 'encrypted',
    id: 'a235l6frtu25df32',
    key: 'SPECIAL_FLAG',
    value: '1',
    target: ['development'],
    gitBranch: null,
    configurationId: null,
    updatedAt: 1557241361445,
    createdAt: 1557241361445,
  },
];

const systemEnvs = [
  {
    type: 'encrypted',
    id: 'a235l6frtu25df32',
    key: 'SYSTEM_ENV_FOR_DEV',
    value: 'development',
    target: ['development'],
    gitBranch: null,
    configurationId: null,
    updatedAt: 1557241361445,
    createdAt: 1557241361445,
  },
  {
    type: 'encrypted',
    id: 'a235l6frtu25df32',
    key: 'SYSTEM_ENV_FOR_PREV',
    value: 'preview',
    target: ['preview'],
    gitBranch: null,
    configurationId: null,
    updatedAt: 1557241361445,
    createdAt: 1557241361445,
  },
  {
    type: 'encrypted',
    id: 'a235l6frtu25df32',
    key: 'SYSTEM_ENV_FOR_PROD',
    value: 'production',
    target: ['production'],
    gitBranch: null,
    configurationId: null,
    updatedAt: 1557241361445,
    createdAt: 1557241361445,
  },
];

export const defaultProject = {
  id: 'foo',
  name: 'cli',
  accountId: 'K4amb7K9dAt5R2vBJWF32bmY',
  createdAt: 1555413045188,
  updatedAt: 1555413045188,
  env: envs,
  targets: {
    production: {
      alias: ['foobar.com'],
      aliasAssigned: 1571239348998,
      createdAt: 1571239348998,
      createdIn: 'sfo1',
      deploymentHostname: 'a-project-name-rjtr4pz3f',
      forced: false,
      id: 'dpl_89qyp1cskzkLrVicDaZoDbjyHuDJ',
      meta: {},
      plan: 'pro',
      private: true,
      readyState: 'READY',
      requestedAt: 1571239348998,
      target: 'production',
      teamId: null,
      type: 'LAMBDAS',
      url: 'a-project-name-rjtr4pz3f.vercel.app',
      userId: 'K4amb7K9dAt5R2vBJWF32bmY',
    },
  },
  latestDeployments: [
    {
      alias: ['foobar.com'],
      aliasAssigned: 1571239348998,
      createdAt: 1571239348998,
      createdIn: 'sfo1',
      deploymentHostname: 'a-project-name-rjtr4pz3f',
      forced: false,
      id: 'dpl_89qyp1cskzkLrVicDaZoDbjyHuDJ',
      meta: {},
      plan: 'pro',
      private: true,
      readyState: 'READY',
      requestedAt: 1571239348998,
      target: 'production',
      teamId: null,
      type: undefined,
      url: 'a-project-name-rjtr4pz3f.vercel.app',
      userId: 'K4amb7K9dAt5R2vBJWF32bmY',
    },
  ],
  alias: [
    {
      domain: 'foobar.com',
      target: 'PRODUCTION' as const,
    },
  ],
};

/**
 * Responds to any GET for a project with a 404.
 * `useUnknownProject` should always come after `useProject`, if any,
 * to allow `useProject` responses to still happen.
 */
export function useUnknownProject() {
  let project: Project;
  client.scenario.get(`/v8/projects/:projectNameOrId`, (_req, res) => {
    res.status(404).send();
  });
  client.scenario.post(`/:version/projects`, (req, res) => {
    const { name } = req.body;
    project = {
      ...defaultProject,
      name,
      id: name,
    };
    res.json(project);
  });
  client.scenario.post(`/v9/projects/:projectNameOrId/link`, (req, res) => {
    const { type, repo, org } = req.body;
    const projName = req.params.projectNameOrId;
    if (projName !== project.name && projName !== project.id) {
      return res.status(404).send('Invalid Project name or ID');
    }
    if (
      (type === 'github' || type === 'gitlab' || type === 'bitbucket') &&
      (repo === 'user/repo' || repo === 'user2/repo2')
    ) {
      project.link = {
        type,
        repo,
        repoId: 1010,
        org,
        gitCredentialId: '',
        sourceless: true,
        createdAt: 1656109539791,
        updatedAt: 1656109539791,
      };
      res.json(project);
    } else {
      if (type === 'github') {
        res.status(400).json({
          message: `To link a GitHub repository, you need to install the GitHub integration first. (400)\nInstall GitHub App: https://github.com/apps/vercel`,
          action: 'Install GitHub App',
          link: 'https://github.com/apps/vercel',
          repo,
        });
      } else {
        res.status(400).json({
          code: 'repo_not_found',
          message: `The repository "${repo}" couldn't be found in your linked ${formatProvider(
            type
          )} account.`,
        });
      }
    }
  });
  client.scenario.patch(`/:version/projects/:projectNameOrId`, (req, res) => {
    Object.assign(project, req.body);
    res.json(project);
  });
}

export function useProject(project: Partial<Project> = defaultProject) {
  client.scenario.get(`/v8/projects/${project.name}`, (_req, res) => {
    res.json(project);
  });
  client.scenario.get(`/v8/projects/${project.id}`, (_req, res) => {
    res.json(project);
  });
  client.scenario.patch(`/:version/projects/${project.id}`, (req, res) => {
    Object.assign(project, req.body);
    res.json(project);
  });
  client.scenario.get(
    `/v6/projects/${project.id}/system-env-values`,
    (_req, res) => {
      const target = _req.query.target || 'development';
      if (typeof target !== 'string') {
        throw new Error(
          `/v6/projects/${project.id}/system-env-values was given a query param of "target=${target}", which is not a valid environment.`
        );
      }
      const targetEnvs = systemEnvs.filter(env => env.target.includes(target));

      res.json({
        systemEnvValues: targetEnvs,
      });
    }
  );
  client.scenario.get(`/v8/projects/${project.id}/env`, (_req, res) => {
    const target = _req.query.target;
    if (typeof target === 'string') {
      const targetEnvs = envs.filter(env => env.target.includes(target));
      res.json({ envs: targetEnvs });
      return;
    }

    res.json({ envs });
  });
  client.scenario.post(`/v8/projects/${project.id}/env`, (req, res) => {
    const envObj = req.body;
    envObj.id = envObj.key;
    envs.push(envObj);
    res.json({ envs });
  });
  client.scenario.delete(
    `/v8/projects/${project.id}/env/:envId`,
    (req, res) => {
      const envId = req.params.envId;
      for (const [i, env] of envs.entries()) {
        if (env.key === envId) {
          envs.splice(i, 1);
          break;
        }
      }
      res.json(envs);
    }
  );
  client.scenario.post(`/v9/projects/${project.id}/link`, (req, res) => {
    const { type, repo, org } = req.body;
    if (
      (type === 'github' || type === 'gitlab' || type === 'bitbucket') &&
      (repo === 'user/repo' || repo === 'user2/repo2' || repo === 'user3/repo3')
    ) {
      project.link = {
        type,
        repo,
        repoId: 1010,
        org,
        gitCredentialId: '',
        sourceless: true,
        createdAt: 1656109539791,
        updatedAt: 1656109539791,
      };
      res.json(project);
    } else {
      if (type === 'github') {
        res.status(400).json({
          message: `To link a GitHub repository, you need to install the GitHub integration first. (400)\nInstall GitHub App: https://github.com/apps/vercel`,
          action: 'Install GitHub App',
          link: 'https://github.com/apps/vercel',
          repo,
        });
      } else {
        res.status(400).json({
          code: 'repo_not_found',
          message: `The repository "${repo}" couldn't be found in your linked ${formatProvider(
            type
          )} account.`,
        });
      }
    }
  });
  client.scenario.delete(`/v9/projects/${project.id}/link`, (_req, res) => {
    if (project.link) {
      project.link = undefined;
    }
    res.json(project);
  });
  client.scenario.get(`/v4/projects`, (req, res) => {
    res.json({
      projects: [defaultProject],
      pagination: null,
    });
  });
  client.scenario.post(`/projects`, (req, res) => {
    const { name } = req.body;
    if (name === project.name) {
      res.json(project);
    }
  });
  client.scenario.delete(`/:version/projects/${project.id}`, (_req, res) => {
    res.json({});
  });

  return { project, envs };
}
