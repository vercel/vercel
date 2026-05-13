import { inferCommands } from './infer-commands';

export const inferredOpenApiCommands = inferCommands({
  projects: {
    createProject: {
      alias: ['add'],
      arguments: {
        'bodyFields.name': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
      examples: [
        {
          name: 'Create a new project',
          value: 'vc projects add my-project --scope my-team',
        },
      ],
    },
    getProject: {
      alias: ['inspect'],
      arguments: {
        'path.idOrName': {
          required: 'project',
        },
      },
    },
    getProjectDomains: {
      alias: ['domains'],
      arguments: {
        'path.idOrName': {
          required: 'project',
        },
      },
      options: {
        'query.teamId': { required: 'team' },
        'query.limit': { required: false },
        'query.redirects': { required: false },
        'query.verified': { required: false },
      },
      examples: [
        {
          name: 'List domains for a project',
          value: 'vc projects domains my-project',
        },
        {
          name: 'List only verified redirects with a limit',
          value:
            'vc projects domains my-project --redirects true --verified true --limit 20',
        },
      ],
    },
    getProjectDomain: {
      alias: ['domain'],
      arguments: {
        'path.idOrName': { required: 'project' },
        'path.domain': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
      examples: [
        {
          name: 'Inspect a specific project domain',
          value: 'vc projects domain my-project example.com',
        },
      ],
    },
    getProjectEnv: {
      alias: ['env'],
      arguments: {
        'path.idOrName': { required: 'project' },
        'path.id': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
      examples: [
        {
          name: 'Inspect an environment variable by id',
          value: 'vc projects env my-project env_123',
        },
      ],
    },
  },
  teams: {
    getTeams: {
      alias: ['list'],
      options: {
        'query.limit': { required: false },
        'query.since': { required: false },
        'query.until': { required: false },
      },
      examples: [
        {
          name: 'List teams',
          value: 'vc teams list --limit 20',
        },
      ],
    },
    getTeamMembers: {
      alias: ['members'],
      arguments: {
        'path.teamId': { required: 'team' },
      },
      options: {
        'query.limit': { required: false },
        'query.role': { required: false },
        'query.search': { required: false },
      },
      examples: [
        {
          name: 'List members for a specific team',
          value: 'vc teams members team_123 --limit 50',
        },
      ],
    },
  },
  webhooks: {
    getWebhooks: {
      alias: ['list'],
      options: {
        'query.teamId': { required: 'team' },
        'query.projectId': { required: false },
      },
      examples: [
        {
          name: 'List webhooks for team context',
          value: 'vc webhooks list --scope my-team',
        },
      ],
    },
    getWebhook: {
      alias: ['inspect'],
      arguments: {
        'path.id': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
      examples: [
        {
          name: 'Inspect a webhook by id',
          value: 'vc webhooks inspect wh_123 --scope my-team',
        },
      ],
    },
  },
  user: {
    listUserEvents: {
      alias: ['events'],
      options: {
        'query.teamId': { required: 'team' },
        'query.limit': { required: false },
        'query.types': { required: false },
      },
      examples: [
        {
          name: 'List user events for a team',
          value: 'vc user events --scope my-team --limit 20',
        },
      ],
    },
  },
});
