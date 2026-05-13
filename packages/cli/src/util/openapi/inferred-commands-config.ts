import { inferCommands } from './infer-commands';

export const inferredOpenApiCommands = inferCommands({
  projects: {
    acceptProjectTransferRequest: {
      alias: ['transfer-accept', 'accept-transfer'],
      arguments: {
        'path.code': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.newProjectName': { required: false, value: 'name' },
        'bodyFields.acceptedPolicies': { required: false },
      },
    },
    addProjectDomain: {
      alias: ['domain-add', 'domains-add'],
      arguments: {
        'path.idOrName': { required: 'project' },
        'bodyFields.name': { required: true, value: 'domain' },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.gitBranch': { required: false, value: 'git-branch' },
        'bodyFields.redirect': { required: false },
      },
    },
    batchRemoveProjectEnv: {
      alias: ['env-rm-many', 'env-prune'],
      arguments: {
        'path.idOrName': { required: 'project' },
        'bodyFields.ids': { required: true, value: 'ids' },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
    },
    createProject: {
      alias: ['add', 'create'],
      arguments: {
        'bodyFields.name': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.framework': { required: false },
        'bodyFields.rootDirectory': { required: false, value: 'root' },
        'bodyFields.buildCommand': { required: false, value: 'build-command' },
        'bodyFields.devCommand': { required: false, value: 'dev-command' },
      },
      examples: [
        {
          name: 'Create a new project',
          value: 'vc projects add my-project --scope my-team',
        },
      ],
    },
    createProjectEnv: {
      alias: ['env-add', 'env-create'],
      arguments: {
        'path.idOrName': { required: 'project' },
      },
      options: {
        'query.teamId': { required: 'team' },
        'query.upsert': { required: false },
      },
    },
    createProjectTransferRequest: {
      alias: ['transfer-request', 'request-transfer'],
      arguments: {
        'path.idOrName': { required: 'project' },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.callbackUrl': { required: false, value: 'callback-url' },
      },
    },
    deleteProject: {
      alias: ['remove', 'rm'],
      arguments: {
        'path.idOrName': { required: 'project' },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
    },
    editProjectEnv: {
      alias: ['env-edit', 'env-update'],
      arguments: {
        'path.idOrName': { required: 'project' },
        'path.id': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.key': { required: false },
        'bodyFields.value': { required: false },
        'bodyFields.target': { required: false },
      },
    },
    filterProjectEnvs: {
      alias: ['env-list', 'env-ls'],
      arguments: {
        'path.idOrName': { required: 'project' },
      },
      options: {
        'query.teamId': { required: 'team' },
        'query.decrypt': { required: false },
        'query.gitBranch': { required: false, value: 'git-branch' },
        'query.customEnvironmentSlug': {
          required: false,
          value: 'environment',
        },
      },
    },
    getProject: {
      alias: ['inspect'],
      arguments: {
        'path.idOrName': {
          required: 'project',
        },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
    },
    getProjectDomain: {
      alias: ['domain', 'domain-inspect'],
      arguments: {
        'path.idOrName': { required: 'project' },
        'path.domain': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
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
    getProjectEnv: {
      alias: ['env', 'env-inspect'],
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
    getProjects: {
      alias: ['list', 'ls'],
      options: {
        'query.teamId': { required: 'team' },
        'query.search': { required: false },
        'query.limit': { required: false },
        'query.from': { required: false, value: 'next' },
        'query.repo': { required: false },
      },
      examples: [
        {
          name: 'List projects for a scope',
          value: 'vc projects ls --scope my-team --limit 20',
        },
      ],
    },
    listPromoteAliases: {
      alias: ['aliases', 'promote-aliases'],
      arguments: {
        'path.projectId': { required: 'project' },
      },
      options: {
        'query.teamId': { required: 'team' },
        'query.limit': { required: false },
        'query.failedOnly': { required: false, value: 'failed-only' },
      },
    },
    moveProjectDomain: {
      alias: ['domain-move', 'move-domain'],
      arguments: {
        'path.idOrName': { required: 'project' },
        'path.domain': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.projectId': { required: false, value: 'to-project' },
      },
    },
    pauseProject: {
      alias: ['pause'],
      arguments: {
        'path.projectId': { required: 'project' },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
    },
    removeProjectDomain: {
      alias: ['domain-remove', 'domain-rm'],
      arguments: {
        'path.idOrName': { required: 'project' },
        'path.domain': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.removeRedirects': {
          required: false,
          value: 'remove-redirects',
        },
      },
    },
    removeProjectEnv: {
      alias: ['env-rm', 'env-remove'],
      arguments: {
        'path.idOrName': { required: 'project' },
        'path.id': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
    },
    requestPromote: {
      alias: ['promote'],
      arguments: {
        'path.projectId': { required: 'project' },
        'path.deploymentId': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
      examples: [
        {
          name: 'Promote a deployment for a project',
          value: 'vc projects promote my-project dpl_123',
        },
      ],
    },
    requestRollback: {
      alias: ['rollback'],
      arguments: {
        'path.projectId': { required: 'project' },
        'path.deploymentId': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
        'query.description': { required: false },
      },
    },
    unpauseProject: {
      alias: ['unpause', 'resume'],
      arguments: {
        'path.projectId': { required: 'project' },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
    },
    updateMicrofrontends: {
      alias: ['microfrontends-update', 'mf-update'],
      arguments: {
        'path.projectId': { required: 'project' },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.enabled': { required: false },
        'bodyFields.microfrontendsGroupId': {
          required: false,
          value: 'group-id',
        },
      },
    },
    updateProject: {
      alias: ['update', 'edit'],
      arguments: {
        'path.idOrName': { required: 'project' },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.name': { required: false },
        'bodyFields.framework': { required: false },
        'bodyFields.rootDirectory': { required: false, value: 'root' },
      },
    },
    updateProjectDomain: {
      alias: ['domain-update', 'domain-edit'],
      arguments: {
        'path.idOrName': { required: 'project' },
        'path.domain': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.redirect': { required: false },
      },
    },
    updateProjectProtectionBypass: {
      alias: ['protection', 'protection-bypass'],
      arguments: {
        'path.idOrName': { required: 'project' },
      },
      options: {
        'query.teamId': { required: 'team' },
        'bodyFields.generate': { required: false },
        'bodyFields.revoke': { required: false },
        'bodyFields.update': { required: false },
      },
    },
    updateProjectsByProjectIdRollbackByDeploymentIdUpdateDescription: {
      alias: ['rollback-describe', 'rollback-update'],
      arguments: {
        'path.projectId': { required: 'project' },
        'path.deploymentId': { required: true },
        'bodyFields.description': { required: true },
      },
    },
    verifyProjectDomain: {
      alias: ['domain-verify', 'verify-domain'],
      arguments: {
        'path.idOrName': { required: 'project' },
        'path.domain': { required: true },
      },
      options: {
        'query.teamId': { required: 'team' },
      },
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
