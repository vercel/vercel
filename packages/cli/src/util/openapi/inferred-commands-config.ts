import { inferCommands, util } from './infer-commands';

export const inferredOpenApiCommands = inferCommands({
  // Uses real CLI top-level command tokens intentionally to expose
  // mismatches between command UX and current OpenAPI tag coverage.
  deployments: {
    getDeployments: {
      value: 'ls',
      options: {
        'query.projectId': { required: 'project' },
        'query.teamId': { required: 'team' },
      },
      display: {
        '200': {
          displayProperty: 'deployments',
          fields: item => ({
            Age: util.color.gray(util.relativeTime(item.createdAt)),
            Project: util.link(
              item.url,
              util.join([util.scope(), item.name], '/')
            ),
            Deployment: util.link(item.url),
            Status: util.switch({
              READY: [
                util.color.green(util.icon('circle-fill')),
                util.capitalize(item.readyState),
              ],
              BUILDING: [
                util.color.yellow(util.icon('circle-fill')),
                util.capitalize(item.readyState),
              ],
              DEPLOYING: [
                util.color.yellow(util.icon('circle-fill')),
                util.capitalize(item.readyState),
              ],
              ANALYZING: [
                util.color.yellow(util.icon('circle-fill')),
                util.capitalize(item.readyState),
              ],
              ERROR: [
                util.color.red(util.icon('circle-fill')),
                util.capitalize(item.readyState),
              ],
              CANCELED: [
                util.color.gray(util.icon('circle-fill')),
                util.capitalize(item.readyState),
              ],
              DEFAULT: util.color.gray(util.capitalize(item.readyState)),
            }),
            Environment: util.capitalize(
              util.conditional(
                item.customEnvironment?.slug,
                item.target,
                'preview'
              )
            ),
            Duration: util.color.gray(
              util.duration(item.ready, item.buildingAt)
            ),
          }),
        },
      },
    },
  },
  projects: {
    name: 'projects',
    aliases: ['project'],
    getProjects: {
      value: 'ls',
      options: {
        'query.search': { required: false, value: 'filter' },
        'query.limit': { required: false },
        'query.from': { required: false, value: 'next' },
        'query.teamId': { required: 'team' },
      },
      display: {
        '200': {
          displayProperty: 'projects',
          fields(item) {
            return {
              'Project Name': item.name,
              'Latest Production URL': util.conditional(
                util.link(item.targets.production.alias[0]),
                '-'
              ),
              Updated: util.color.gray(util.relativeTime(item.updatedAt)),
              'Node Version': util.switch({
                '24.x': util.color.green(item.nodeVersion),
                '22.x': util.color.green(item.nodeVersion),
                '20.x': util.color.yellow(item.nodeVersion),
                DEFAULT: util.color.red(item.nodeVersion),
              }),
            };
          },
          // displayProperty: 'projects',
          // fields: project => ({
          //   id: project.id,
          //   productionUrl: project.targets.production.alias[0],
          // }),
        },
        '400': {
          errorFields: ['error.code', 'error.message'],
        },
        '401': {
          errorFields: ['error.code', 'error.message'],
        },
        '403': {
          errorFields: ['error.code', 'error.message'],
        },
      },
    },
    getProject: {
      value: 'inspect',
      arguments: {
        'path.idOrName': { required: 'project', value: 'name' },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
      display: {
        '200': {
          displayProperty: undefined,
          fields: item => ({
            General: {
              ID: item.id,
              Name: item.name,
              Owner: util.scope(),
              'Created At': util.color.gray(util.relativeTime(item.createdAt)),
              'Root Directory': util.conditional(item.rootDirectory, '.'),
              'Node.js Version': util.switch({
                '24.x': util.color.green(item.nodeVersion),
                '22.x': util.color.green(item.nodeVersion),
                '20.x': util.color.yellow(item.nodeVersion),
                DEFAULT: util.color.red(item.nodeVersion),
              }),
            },
            'Framework Settings': {
              'Framework Preset': util.capitalize(item.framework),
              'Build Command': util.conditional(item.buildCommand, 'None'),
              'Output Directory': util.conditional(
                item.outputDirectory,
                'None'
              ),
              'Install Command': util.conditional(item.installCommand, 'None'),
            },
          }),
        },
      },
    },
    createProject: {
      value: 'add',
      arguments: {
        'bodyFields.name': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.framework': { required: false },
        'bodyFields.rootDirectory': { required: false, value: 'root' },
      },
    },
  },
  env: {
    filterProjectEnvs: {
      value: 'ls',
      arguments: {
        'path.idOrName': { required: 'project', value: 'project' },
      },
      options: {
        'query.teamId': { required: 'team' },
        'query.customEnvironmentSlug': {
          required: false,
          value: 'environment',
        },
        'query.gitBranch': { required: false, value: 'git-branch' },
        'query.decrypt': { required: false },
      },
    },
    createProjectEnv: {
      value: 'add',
      arguments: {
        'path.idOrName': { required: 'project', value: 'project' },
        name: { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
        'query.upsert': { required: false, value: 'force' },
        value: { required: false },
      },
    },
  },
  webhooks: {
    getWebhooks: {
      value: 'ls',
      options: {
        'query.teamId': { required: 'team' },
        'query.projectId': { required: false, value: 'project' },
      },
    },
    getWebhook: {
      value: 'inspect',
      arguments: {
        'path.id': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
    },
    createWebhook: {
      value: 'create',
      arguments: {
        'bodyFields.url': { required: true, value: 'url' },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.events': { required: false, value: 'event' },
        'bodyFields.projectIds': { required: false, value: 'project' },
      },
    },
  },
  'deploy-hooks': {
    listDeployHooks: {
      value: 'ls',
      options: {
        'query.projectId': { required: false, value: 'project' },
        'query.teamId': { required: 'team' },
      },
    },
    createDeployHook: {
      value: 'create',
      arguments: {
        'bodyFields.name': { required: false, value: 'name' },
      },
      options: {
        'query.projectId': { required: false, value: 'project' },
        'query.teamId': { required: 'team' },
        'bodyFields.ref': { required: false, value: 'ref' },
      },
    },
  },
  'edge-config': {
    updateEdgeConfig: {
      value: 'update',
      arguments: {
        'path.edgeConfigId': { required: true, value: 'id-or-slug' },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.slug': { required: false, value: 'slug' },
        patch: { required: false },
      },
    },
  },
  integration: {
    listResources: {
      value: 'list',
      arguments: {
        project: { required: false },
      },
      options: {
        integration: { required: false },
        all: { required: false },
      },
    },
    getConfigurations: {
      value: 'installations',
      options: {
        integration: { required: false },
      },
    },
    createIntegrationStoreDirect: {
      value: 'add',
      arguments: {
        integration: { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.name': { required: false },
        'bodyFields.metadata': { required: false, value: 'metadata' },
      },
    },
    updateConfiguration: {
      value: 'update',
      arguments: {
        integration: { required: true },
      },
      options: {
        plan: { required: false },
        projects: { required: false },
        'query.teamId': { required: 'team' },
      },
    },
    deleteConfiguration: {
      value: 'remove',
      arguments: {
        integration: { required: true },
      },
      options: {
        yes: { required: false },
        'query.teamId': { required: 'team' },
      },
    },
  },
  domains: {
    getDomains: {
      value: 'ls',
      options: {
        limit: { required: false },
        next: { required: false },
        'query.teamId': { required: 'team' },
      },
    },
    getDomain: {
      value: 'inspect',
      arguments: {
        'path.domain': { required: true, value: 'domain' },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
    },
    createOrTransferDomain: {
      value: 'add',
      arguments: {
        domain: { required: true },
        project: { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
        force: { required: false },
      },
    },
    transferInDomain: {
      value: 'transfer-in',
      arguments: {
        domain: { required: true },
      },
      options: {
        code: { required: false },
        'query.teamId': { required: 'team' },
      },
    },
  },
});
