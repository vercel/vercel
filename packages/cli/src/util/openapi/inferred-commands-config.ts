import { inferCommands } from './infer-commands';

export const inferredOpenApiCommands = inferCommands({
  // Uses real CLI top-level command tokens intentionally to expose
  // mismatches between command UX and current OpenAPI tag coverage.
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
    },
    getProject: {
      value: 'inspect',
      arguments: {
        'path.idOrName': { required: 'project', value: 'name' },
      },
      options: {
        'query.teamId': { required: 'team' },
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
