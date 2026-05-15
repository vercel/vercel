import {
  type DisplayFormattedValue,
  type DisplayScalarToken,
  inferCommands,
  util,
} from './infer-commands';

type DisplayUnknownAccessor = DisplayScalarToken | DisplayFormattedValue;

const statusSwitch = (status: DisplayUnknownAccessor) =>
  util.switch({
    READY: [
      util.color.green(util.icon('circle-fill')),
      util.capitalize(status),
    ],
    BUILDING: [
      util.color.yellow(util.icon('circle-fill')),
      util.capitalize(status),
    ],
    DEPLOYING: [
      util.color.yellow(util.icon('circle-fill')),
      util.capitalize(status),
    ],
    ANALYZING: [
      util.color.yellow(util.icon('circle-fill')),
      util.capitalize(status),
    ],
    ERROR: [util.color.red(util.icon('circle-fill')), util.capitalize(status)],
    CANCELED: [
      util.color.gray(util.icon('circle-fill')),
      util.capitalize(status),
    ],
    DEFAULT: util.color.gray(util.capitalize(status)),
  });

export const inferredOpenApiCommands = inferCommands({
  // Uses real CLI top-level command tokens intentionally to expose
  // mismatches between command UX and current OpenAPI tag coverage.
  deployments: {
    getDeployment: {
      value: 'inspect',
      arguments: {
        'path.idOrUrl': { required: true, value: 'id', filter: 'deployments' },
      },
      options: {
        'query.teamId': { inferFrom: 'team' },
      },
      display: {
        '200': {
          displayProperty: undefined,
          fields: item => ({
            Age: util.color.gray(util.relativeTime(item.createdAt)),
            Project: util.link(
              item.url,
              util.join([util.scope(), item.name], '/')
            ),
            Deployment: util.link(item.url),
            Status: statusSwitch(item.readyState),
          }),
          json: 'all',
        },
      },
    },
    getDeployments: {
      value: 'list',
      aliases: ['ls'],
      options: {
        'query.projectId': { inferFrom: 'project' },
        'query.teamId': { inferFrom: 'team' },
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
            Status: statusSwitch(item.readyState),
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
      value: 'list',
      aliases: ['ls'],
      options: {
        'query.search': { value: 'filter' },
        'query.until': { value: 'next' },
        'query.deprecated': { value: 'update-required' },
        'query.teamId': { inferFrom: 'team' },
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
              Status: statusSwitch(item.targets.production.readyState),
              'Node Version': util.switch({
                '24.x': util.color.green(item.nodeVersion),
                '22.x': util.color.green(item.nodeVersion),
                '20.x': util.color.yellow(item.nodeVersion),
                DEFAULT: util.color.red(item.nodeVersion),
              }),
            };
          },
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
        'path.idOrName': { required: true, inferFrom: 'project' },
      },
      options: {
        'query.teamId': { inferFrom: 'team' },
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
            'Latest Production Deployment': {
              ID: item.targets.production.id,
              Name: item.targets.production.name,
              URL: util.link(item.targets.production.url),
              Alias: util.conditional(item.targets.production.alias[0], 'None'),
              Status: statusSwitch(item.targets.production.readyState),
              'Created At': util.color.gray(
                util.relativeTime(item.targets.production.createdAt)
              ),
              'Updated At': util.conditional(
                util.color.gray(
                  util.relativeTime(item.targets.production.updatedAt)
                ),
                '-'
              ),
            },
          }),
          // json: 'all'
          // json: item => ({
          //   id: item.id,
          //   name: item.name,
          //   latestProductionDeployment: {
          //     id: item.targets.production.id,
          //     name: item.targets.production.name,
          //     url: item.targets.production.url,
          //     alias: item.targets.production.alias[0],
          //     readyState: item.targets.production.readyState,
          //   },
          //   production: item.targets.production,
          // })
        },
      },
    },
    createProject: {
      value: 'add',
      arguments: {
        'bodyFields.name': { required: true },
      },
      options: {
        'query.teamId': { inferFrom: 'team' },
        'bodyFields.framework': {},
        'bodyFields.rootDirectory': { value: 'root' },
      },
    },
  },
  env: {
    filterProjectEnvs: {
      value: 'list',
      arguments: {
        'path.idOrName': {
          required: true,
          inferFrom: 'project',
          value: 'project',
        },
      },
      options: {
        'query.teamId': { inferFrom: 'team' },
        'query.customEnvironmentSlug': {
          value: 'environment',
        },
        'query.gitBranch': { value: 'git-branch' },
        'query.decrypt': {},
      },
    },
    createProjectEnv: {
      value: 'add',
      arguments: {
        'path.idOrName': {
          required: true,
          inferFrom: 'project',
          value: 'project',
        },
        name: { required: true },
      },
      options: {
        'query.teamId': { inferFrom: 'team' },
        'query.upsert': { value: 'force' },
        value: {},
      },
    },
  },
  webhooks: {
    getWebhooks: {
      value: 'list',
      options: {
        'query.teamId': { inferFrom: 'team' },
        'query.projectId': { value: 'project' },
      },
    },
    getWebhook: {
      value: 'inspect',
      arguments: {
        'path.id': { required: true },
      },
      options: {
        'query.teamId': { inferFrom: 'team' },
      },
    },
    createWebhook: {
      value: 'create',
      arguments: {
        'bodyFields.url': { required: true, value: 'url' },
      },
      options: {
        'query.teamId': { inferFrom: 'team' },
        'bodyFields.events': { value: 'event' },
        'bodyFields.projectIds': { value: 'project' },
      },
    },
  },
  'deploy-hooks': {
    listDeployHooks: {
      value: 'list',
      options: {
        'query.projectId': { value: 'project' },
        'query.teamId': { inferFrom: 'team' },
      },
    },
    createDeployHook: {
      value: 'create',
      arguments: {
        'bodyFields.name': { value: 'name' },
      },
      options: {
        'query.projectId': { value: 'project' },
        'query.teamId': { inferFrom: 'team', value: 'team' },
        'bodyFields.ref': { value: 'ref' },
      },
    },
  },
});
