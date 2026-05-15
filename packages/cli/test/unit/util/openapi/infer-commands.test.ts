import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inferCommands,
  resolveInferredCommand,
  runInferredCommand,
  util,
} from '../../../../src/util/openapi/infer-commands';
import { client } from '../../../mocks/client';
import { OpenApiCache } from '../../../../src/util/openapi/openapi-cache';
import type { EndpointInfo } from '../../../../src/util/openapi/types';
import * as linkUtils from '../../../../src/util/projects/link';
import * as teamUtils from '../../../../src/util/teams/get-teams';
import * as projectUtils from '../../../../src/util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../../../src/util/errors-ts';
import { Router } from 'express';

describe('inferCommands', () => {
  const commands = inferCommands({
    projects: {
      name: 'projects',
      aliases: ['project'],
      list: {
        value: 'ls',
        display: {
          '200': {
            displayProperty: 'projects',
            fields: (project: any) => ({
              id: project.id,
            }),
          },
          '400': {
            errorFields: ['error.code', 'error.message'],
          },
        },
        arguments: {
          'bodyFields.name': {
            required: true,
          },
        },
        options: {
          'query.teamId': {
            inferFrom: 'team',
          },
          'query.slug': {
            value: 'slugFilter',
          },
        },
      },
    },
  });

  const listEndpoint: EndpointInfo = {
    path: '/v9/projects',
    method: 'GET',
    operationId: 'list',
    summary: 'List projects',
    description: 'Returns projects for the current account',
    tags: ['projects'],
    parameters: [
      {
        name: 'teamId',
        in: 'query',
        required: false,
        schema: { type: 'string' },
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'number' },
      },
    ],
  };

  const inspectEndpoint: EndpointInfo = {
    path: '/v9/projects/{idOrName}',
    method: 'GET',
    operationId: 'inspect',
    summary: 'Inspect project',
    description: 'Get project details',
    tags: ['projects'],
    parameters: [
      {
        name: 'idOrName',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
      {
        name: 'teamId',
        in: 'query',
        required: false,
        schema: { type: 'string' },
      },
    ],
  };

  const createEndpoint: EndpointInfo = {
    path: '/v9/projects',
    method: 'POST',
    operationId: 'create',
    summary: 'Create project',
    description: 'Create a new project',
    tags: ['projects'],
    parameters: [
      {
        name: 'teamId',
        in: 'query',
        required: false,
        schema: { type: 'string' },
      },
    ],
  };

  const inspectDeploymentEndpoint: EndpointInfo = {
    path: '/v13/deployments/{id}',
    method: 'GET',
    operationId: 'getDeployment',
    summary: 'Inspect deployment',
    description: 'Get deployment details',
    tags: ['deployments'],
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
      {
        name: 'teamId',
        in: 'query',
        required: false,
        schema: { type: 'string' },
      },
    ],
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves a configured tag and operationId', () => {
    expect(resolveInferredCommand(commands, ['projects', 'list'])).toEqual(
      expect.objectContaining({
        tag: 'projects',
        operationId: 'list',
        config: expect.objectContaining({
          value: 'ls',
          display: expect.objectContaining({
            '200': expect.objectContaining({
              displayProperty: 'projects',
              fields: expect.any(Function),
            }),
          }),
        }),
      })
    );
  });

  it('resolves a configured value to the operationId', () => {
    expect(resolveInferredCommand(commands, ['projects', 'ls'])).toEqual(
      expect.objectContaining({
        tag: 'projects',
        operationId: 'list',
        config: expect.objectContaining({
          value: 'ls',
        }),
      })
    );
  });

  it('resolves a configured tag alias to the operationId', () => {
    expect(resolveInferredCommand(commands, ['project', 'ls'])).toEqual(
      expect.objectContaining({
        tag: 'projects',
        operationId: 'list',
        config: expect.objectContaining({
          value: 'ls',
        }),
      })
    );
  });

  it('resolves configured operation aliases to the operationId', () => {
    const commandsWithOperationAlias = inferCommands({
      projects: {
        list: {
          value: 'list',
          aliases: ['ls'],
        },
      },
    });

    expect(
      resolveInferredCommand(commandsWithOperationAlias, ['projects', 'ls'])
    ).toEqual(
      expect.objectContaining({
        tag: 'projects',
        operationId: 'list',
        config: expect.objectContaining({
          value: 'list',
          aliases: ['ls'],
        }),
      })
    );
  });

  it('returns null when the command is not configured', () => {
    expect(
      resolveInferredCommand(commands, ['projects', 'inspect'])
    ).toBeNull();
    expect(resolveInferredCommand(commands, ['projects'])).toBeNull();
  });

  it('prints configured tags when help is requested without a tag', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);

    const exitCode = await runInferredCommand(commands, [], { help: true });
    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Inferred OpenAPI tags');
    expect(output).toContain('projects');
    expect(output).toContain('Operation');
    expect(output).toContain('Description');
    expect(output).toContain('ls');
    expect(output).not.toContain('ls (list)');
    expect(output).toContain('List projects');
  });

  it('prints operations when only a tag is provided', async () => {
    const exitCode = await runInferredCommand(commands, ['projects']);
    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Inferred OpenAPI operations for "projects"');
    expect(output).toContain('ls');
    expect(output).toContain('List projects');
  });

  it('prints operation ids when a tag alias is provided', async () => {
    const exitCode = await runInferredCommand(commands, ['project']);
    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Inferred OpenAPI operations for "projects"');
    expect(output).toContain('vercel projects');
    expect(output).toContain('project');
  });

  it('short-circuits dispatch and prints context plus request preview', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([
      {
        name: 'name',
        required: true,
        type: 'string',
        description: 'Project name',
      },
    ]);
    vi.spyOn(linkUtils, 'getLinkFromDir').mockResolvedValue({
      projectId: 'prj_123',
      orgId: 'team_linked',
    });

    const exitCode = await runInferredCommand(commands, [
      'projects',
      'list',
      'my-project',
      '--scope',
      'my-team',
      '--slugFilter',
      'starter',
    ]);
    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('"tag": "projects"');
    expect(output).toContain('"operationId": "list"');
    expect(output).toContain('"context"');
    expect(output).toContain('"project"');
    expect(output).toContain('"id": "prj_123"');
    expect(output).toContain('"team"');
    expect(output).toContain('"value": "my-team"');
    expect(output).toContain('"provided"');
    expect(output).toContain('"name": "my-project"');
    expect(output).toContain('"scope": "my-team"');
    expect(output).toContain('"slugFilter": "starter"');
    expect(output).toContain('"request"');
    expect(output).toContain('"method": "GET"');
    expect(output).toContain(
      '"url": "https://api.vercel.com/v9/projects?slug=starter&teamId=my-team"'
    );
    expect(output).toContain('"body": {');
    expect(output).not.toContain('"metadata"');
  });

  it('prints matched value when value token is used', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const exitCode = await runInferredCommand(commands, ['projects', 'ls']);
    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('"operationId": "list"');
    expect(output).toContain('"value": "ls"');
    expect(output).toContain('"matchedValue": "ls"');
  });

  it('executes the inferred API request when a client is provided', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [{ id: 'prj_123' }],
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(commands, ['projects', 'ls'], {
      client,
      api: client.apiUrl,
    });
    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toContain('id');
    expect(client.stdout.getFullOutput()).toContain('prj_123');
    expect(client.stdout.getFullOutput()).not.toContain('"id"');
    expect(client.stderr.getFullOutput()).not.toContain('"request"');
  });

  it('applies configured display fields for successful responses', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [{ id: 'prj_123' }],
        pagination: { count: 1, next: 123, prev: null },
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(commands, ['projects', 'ls'], {
      client,
      api: client.apiUrl,
    });
    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('id');
    expect(stdout).toContain('prj_123');
    expect(stdout).not.toContain('"id"');
    expect(stdout).not.toContain('"pagination"');
  });

  it('returns full JSON when --raw is passed', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [{ id: 'prj_123' }],
        pagination: { count: 1, next: 123, prev: null },
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commands,
      ['projects', 'ls', '--raw'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('"pagination": {');
    expect(stdout).toContain('"count": 1');
    expect(stdout).toContain('"next": 123');
    expect(stdout).not.toContain('"pagination.next"');
  });

  it('renders display fields as JSON when --json is passed', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [{ id: 'prj_123' }],
        pagination: { count: 1, next: 123, prev: null },
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commands,
      ['projects', 'ls', '--json'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('"id": "prj_123"');
    expect(stdout).not.toContain('"pagination"');
  });

  it('returns full response JSON when display json is set to all', async () => {
    const commandsWithJsonAll = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              displayProperty: 'projects',
              fields: (project: any) => ({
                id: project.id,
              }),
              json: 'all',
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [{ id: 'prj_123' }],
        pagination: { count: 1, next: 123, prev: null },
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithJsonAll,
      ['projects', 'ls', '--json'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('"projects": [');
    expect(stdout).toContain('"pagination": {');
  });

  it('returns selective JSON keys when display json mapper is provided', async () => {
    const commandsWithJsonMapper = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              displayProperty: 'projects',
              fields: (project: any) => ({
                id: project.id,
              }),
              json: (project: any) => ({
                id: project.id,
                project,
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [
          {
            id: 'prj_123',
            name: 'alpha',
            framework: 'nextjs',
          },
        ],
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithJsonMapper,
      ['projects', 'ls', '--json'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('"id": "prj_123"');
    expect(stdout).toContain('"project": {');
    expect(stdout).toContain('"framework": "nextjs"');
  });

  it('joins inline display arrays and strips hyperlink control sequences for --json', async () => {
    const commandsWithColoredFields = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              displayProperty: 'projects',
              fields: (project: any) => ({
                id: project.id,
                age: util.color.gray(util.relativeTime(project.updatedAt)),
                status: [
                  util.color.green(util.icon('circle-fill')),
                  util.capitalize(project.readyState),
                ],
                link: util.link(project.url),
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);
    vi.spyOn(Date, 'now').mockReturnValue(10_000);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [
          {
            id: 'prj_123',
            updatedAt: 9_000,
            readyState: 'READY',
            url: 'project-123.vercel.app',
          },
        ],
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithColoredFields,
      ['projects', 'ls', '--json'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('"id"');
    expect(stdout).toContain('project-123.vercel.app');
    expect(stdout).not.toContain('"status": [');
    expect(stdout).toContain('"status": "READY"');
    expect(stdout).not.toContain(']8;;');
  });

  it('renders table rows when fields use nested format helpers', async () => {
    const commandsWithNestedDisplay = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              displayProperty: 'projects',
              table: true,
              fields: (project: any) => ({
                'Project Name': util.color.cyan(project.name),
                Updated: util.color.gray(util.relativeTime(project.updatedAt)),
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);
    vi.spyOn(Date, 'now').mockReturnValue(10_000);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [{ name: 'alpha', updatedAt: 9_000 }],
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithNestedDisplay,
      ['projects', 'ls'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Project Name');
    expect(stdout).toContain('Updated');
    expect(stdout).toContain('alpha');
    expect(stdout).toContain('1s');
    expect(stdout).not.toContain('"name"');
    expect(stdout).not.toContain('"updatedAt"');
  });

  it('infers table rendering for array display payloads', async () => {
    const commandsWithImplicitTableDisplay = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              displayProperty: 'projects',
              fields: (project: any) => ({
                'Project Name': project.name,
                Updated: util.relativeTime(project.updatedAt),
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);
    vi.spyOn(Date, 'now').mockReturnValue(10_000);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [{ name: 'alpha', updatedAt: 9_000 }],
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithImplicitTableDisplay,
      ['projects', 'ls'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Project Name');
    expect(stdout).toContain('Updated');
    expect(stdout).toContain('alpha');
    expect(stdout).toContain('1s');
    expect(stdout).not.toContain('"name"');
  });

  it('renders card rows for object display payloads', async () => {
    const commandsWithCardDisplay = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              fields: (item: any) => ({
                'Project Name': item.name,
                Updated: util.relativeTime(item.updatedAt),
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);
    vi.spyOn(Date, 'now').mockReturnValue(10_000);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        name: 'alpha',
        updatedAt: 9_000,
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithCardDisplay,
      ['projects', 'ls'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Project Name');
    expect(stdout).toContain('Updated');
    expect(stdout).toContain('alpha');
    expect(stdout).toContain('1s');
    expect(stdout).not.toContain('"Project Name"');
    expect(stdout).not.toContain('"updatedAt"');
  });

  it('renders sectioned card output for nested display objects', async () => {
    const commandsWithSectionedCardDisplay = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              fields: (item: any) => ({
                General: {
                  Name: item.name,
                  Owner: util.scope(),
                },
                'Framework Settings': {
                  Framework: util.capitalize(item.framework),
                },
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        name: 'alpha',
        framework: 'nextjs',
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithSectionedCardDisplay,
      ['projects', 'ls'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('General');
    expect(stdout).toContain('Framework Settings');
    expect(stdout).toContain('Name');
    expect(stdout).toContain('alpha');
    expect(stdout).toContain('Framework');
    expect(stdout).toContain('Nextjs');
  });

  it('supports multiline table cells via util.multiline', async () => {
    const commandsWithMultilineTableCells = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              displayProperty: 'projects',
              fields: (item: any) => ({
                Name: item.name,
                Details: util.multiline([item.name, util.link(item.url)]),
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [{ name: 'alpha', url: 'alpha.vercel.app' }],
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithMultilineTableCells,
      ['projects', 'ls'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Name');
    expect(stdout).toContain('Details');
    expect(stdout).toContain('alpha');
    expect(stdout).toContain('https://alpha.vercel.app');
    expect(stdout).toMatch(/alpha[\s\S]*https:\/\/alpha\.vercel\.app/u);
    expect(stdout).not.toContain('"url"');
  });

  it('supports util.switch with DEFAULT branch for formatted fields', async () => {
    const commandsWithSwitchDisplay = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              displayProperty: 'projects',
              table: true,
              fields: (project: any) => ({
                'Node Version': util.switch({
                  '24.x': util.color.green(project.nodeVersion),
                  '22.x': util.color.green(project.nodeVersion),
                  '20.x': util.color.yellow(project.nodeVersion),
                  DEFAULT: util.color.red(project.nodeVersion),
                }),
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [{ nodeVersion: '24.x' }, { nodeVersion: '18.x' }],
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithSwitchDisplay,
      ['projects', 'ls'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Node Version');
    expect(stdout).toContain('24.x');
    expect(stdout).toContain('18.x');
    expect(stdout).not.toContain('"nodeVersion"');
  });

  it('supports util.link with optional display text', async () => {
    const commandsWithLinkDisplay = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              displayProperty: 'projects',
              table: true,
              fields: (project: any) => ({
                URL: util.link(project.url),
                Visit: util.link(project.url, project.name),
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [{ url: 'alpha.vercel.app', name: 'alpha' }],
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithLinkDisplay,
      ['projects', 'ls'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('URL');
    expect(stdout).toContain('Visit');
    expect(stdout).toContain('https://alpha.vercel.app');
    expect(stdout).toContain('alpha');
    expect(stdout).not.toContain('"url"');
  });

  it('supports util.conditional fallback for nullish display values', async () => {
    const commandsWithConditionalDisplay = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              displayProperty: 'projects',
              table: true,
              fields: (project: any) => ({
                URL: util.conditional(
                  util.link(project.url, project.name),
                  '--'
                ),
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [
          { url: null, name: 'alpha' },
          { url: 'beta.vercel.app', name: 'beta' },
        ],
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithConditionalDisplay,
      ['projects', 'ls'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('URL');
    expect(stdout).toContain('--');
    expect(stdout).toContain('beta');
    expect(stdout).not.toContain('"name"');
  });

  it('supports util.duration formatting for deployment timing fields', async () => {
    const commandsWithDurationDisplay = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              displayProperty: 'projects',
              table: true,
              fields: (project: any) => ({
                Duration: util.duration(project.ready, project.buildingAt),
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [
          { ready: 10_000, buildingAt: 5_000 },
          { ready: 7_000, buildingAt: 7_000 },
          { ready: null, buildingAt: 2_000 },
        ],
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithDurationDisplay,
      ['projects', 'ls'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Duration');
    expect(stdout).toContain('5s');
    expect(stdout).toContain('--');
    expect(stdout).toContain('?');
  });

  it('supports icon and capitalize with inline array display composition', async () => {
    const commandsWithInlineStatusDisplay = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              displayProperty: 'projects',
              table: true,
              fields: (project: any) => ({
                Status: util.switch({
                  READY: [
                    util.color.green(util.icon('circle-fill')),
                    util.capitalize(project.readyState),
                  ],
                  DEFAULT: util.capitalize(project.readyState),
                }),
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [{ readyState: 'READY' }, { readyState: 'ERROR' }],
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithInlineStatusDisplay,
      ['projects', 'ls'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Status');
    expect(stdout).toContain('● Ready');
    expect(stdout).toContain('Error');
    expect(stdout).not.toContain('["');
  });

  it('supports nesting capitalize with conditional fallback', async () => {
    const commandsWithNestedConditionalDisplay = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              displayProperty: 'projects',
              table: true,
              fields: (project: any) => ({
                Environment: util.capitalize(
                  util.conditional(
                    project.customEnvironment?.slug,
                    project.target,
                    '-'
                  )
                ),
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [{ customEnvironment: null, target: 'production' }],
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithNestedConditionalDisplay,
      ['projects', 'ls'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Environment');
    expect(stdout).toContain('Production');
  });

  it('supports util.scope and util.join in display fields', async () => {
    const commandsWithScopeJoinDisplay = inferCommands({
      projects: {
        list: {
          value: 'ls',
          display: {
            '200': {
              displayProperty: 'projects',
              table: true,
              fields: (project: any) => ({
                Project: util.join([util.scope(), project.id], '/'),
              }),
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const scenario = Router();
    scenario.get('/v9/projects', (_req, res) => {
      res.status(200).json({
        projects: [{ id: 'prj_123' }],
      });
    });
    client.useScenario(scenario);
    client.config.currentTeam = 'team_current_123';

    const exitCode = await runInferredCommand(
      commandsWithScopeJoinDisplay,
      ['projects', 'ls'],
      {
        client,
        api: client.apiUrl,
        scope: 'jsee',
      }
    );
    expect(exitCode).toBe(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Project');
    expect(stdout).toContain('jsee/prj_123');
  });

  it('prints formatted request preview when dry-run is enabled', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);
    vi.spyOn(linkUtils, 'getLinkFromDir').mockResolvedValue({
      projectId: 'prj_123',
      orgId: 'team_123',
    });

    const exitCode = await runInferredCommand(commands, [
      'projects',
      'ls',
      '--dry-run',
      '--scope',
      'my-team',
      '--slugFilter',
      'starter',
    ]);
    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Inferred command dry run: projects ls');
    expect(output).toContain('Request:');
    expect(output).toContain('Context:');
    expect(output).toContain('Provided Options:');
    expect(output).toContain('Request Query:');
    expect(output).toContain('starter');
    expect(output).not.toContain('"tag": "projects"');
  });

  it('infers teamId from default team when no scope flag is passed', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);
    vi.spyOn(linkUtils, 'getLinkFromDir').mockResolvedValue(null);

    const scenario = Router();
    scenario.get('/v2/user', (_req, res) => {
      res.status(200).json({
        user: {
          id: 'usr_123',
          username: 'tester',
          email: 'tester@example.com',
          version: 'northstar',
          defaultTeamId: 'team_default_123',
        },
      });
    });
    client.useScenario(scenario);

    const exitCode = await runInferredCommand(
      commands,
      ['projects', 'ls', '--dry-run'],
      {
        client,
        api: client.apiUrl,
      }
    );
    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('teamSource');
    expect(output).toContain('default-team');
    expect(output).toContain('Request Query:');
    expect(output).toContain('teamId');
    expect(output).toContain('team_default_123');
  });

  it('maps teamId arguments to team in output and request path', async () => {
    const commandsWithTeamArgument = inferCommands({
      teams: {
        getTeam: {
          value: 'inspect',
          arguments: {
            'path.teamId': {
              required: true,
              inferFrom: 'team',
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      {
        path: '/v2/teams/{teamId}',
        method: 'GET',
        operationId: 'getTeam',
        summary: 'Get team',
        description: 'Fetch team details',
        tags: ['teams'],
        parameters: [
          {
            name: 'teamId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
      },
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const exitCode = await runInferredCommand(commandsWithTeamArgument, [
      'teams',
      'inspect',
      'my-team',
    ]);
    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('"arguments": {');
    expect(output).toContain('"team": "my-team"');
    expect(output).not.toContain('"teamId": "my-team"');
    expect(output).toContain('"path": "/v2/teams/my-team"');
  });

  it('prints inferred help output when help is requested', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const exitCode = await runInferredCommand(commands, ['projects', 'ls'], {
      help: true,
      columns: 120,
    });

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('vercel projects ls');
    expect(output).toContain('Global Options');
    expect(output).not.toContain('--name');
    expect(output).not.toContain('"operationId": "list"');
  });

  it('supports inline -h for tag+operation help output', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const exitCode = await runInferredCommand(commands, ['projects', 'ls'], {
      help: true,
      columns: 120,
    });

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('vercel projects ls');
    expect(output).toContain('Global Options');
  });

  it('shows argument inference hints for context-inferred arguments', async () => {
    const commandsWithProjectInference = inferCommands({
      projects: {
        inspect: {
          value: 'inspect',
          arguments: {
            'path.idOrName': {
              required: true,
              inferFrom: 'project',
              value: 'name',
            },
          },
          options: {
            'query.teamId': { inferFrom: 'team' },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      inspectEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);

    const exitCode = await runInferredCommand(
      commandsWithProjectInference,
      ['projects', 'inspect'],
      {
        help: true,
        columns: 120,
      }
    );

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('vercel projects inspect [name]');
    expect(output).toContain('Arguments:');
    expect(output).toContain('name');
    expect(output).toContain('Required if project context is missing. ');
    expect(output).toContain(
      'Inferred from the current project context when available.'
    );
  });

  it('does not show required arguments as options when options are omitted', async () => {
    const commandsWithoutOptions = inferCommands({
      projects: {
        list: {
          value: 'ls',
          arguments: {
            'bodyFields.name': {
              required: true,
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      listEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([
      {
        name: 'name',
        required: true,
        type: 'string',
        description: 'Project name',
      },
    ]);

    const exitCode = await runInferredCommand(
      commandsWithoutOptions,
      ['projects', 'ls'],
      {
        help: true,
        columns: 120,
      }
    );

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).not.toContain('--name');
  });

  it('fails early with a clear error when required positional input is missing', async () => {
    const commandsWithRequiredArgument = inferCommands({
      projects: {
        create: {
          value: 'add',
          arguments: {
            'bodyFields.name': {
              required: true,
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      createEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([
      {
        name: 'name',
        required: true,
        type: 'string',
        description: 'Project name',
      },
    ]);
    client.nonInteractive = true;

    const exitCode = await runInferredCommand(
      commandsWithRequiredArgument,
      ['projects', 'add'],
      {
        client,
        api: client.apiUrl,
      }
    );

    expect(exitCode).toBe(1);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Missing required inputs for inferred command.');
    expect(output).toContain('name');
    expect(output).toContain('Required input is missing.');
  });

  it('prompts for missing required arguments in interactive TTY mode', async () => {
    const commandsWithRequiredArgument = inferCommands({
      projects: {
        create: {
          value: 'add',
          arguments: {
            'bodyFields.name': {
              required: true,
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      createEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([
      {
        name: 'name',
        required: true,
        type: 'string',
        description: 'Project name',
      },
    ]);
    const promptSpy = vi
      .spyOn(client.input, 'text')
      .mockResolvedValue('prompted-project');

    const exitCode = await runInferredCommand(
      commandsWithRequiredArgument,
      ['projects', 'add', '--dry-run'],
      {
        client,
        api: client.apiUrl,
      }
    );

    expect(exitCode).toBe(0);
    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(client.stderr.getFullOutput()).toContain('prompted-project');
  });

  it('uses search autocomplete for missing project context values', async () => {
    const commandsWithContextPrompts = inferCommands({
      projects: {
        inspect: {
          value: 'inspect',
          arguments: {
            'path.idOrName': {
              required: true,
              inferFrom: 'project',
              value: 'name',
            },
          },
          options: {
            'query.teamId': {
              inferFrom: 'team',
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      inspectEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);
    vi.spyOn(linkUtils, 'getLinkFromDir').mockResolvedValue(null);
    const searchSpy = vi
      .spyOn(client.input, 'search')
      .mockResolvedValueOnce('my-project');

    const exitCode = await runInferredCommand(
      commandsWithContextPrompts,
      ['projects', 'inspect', '--dry-run'],
      {
        client,
        api: client.apiUrl,
        projectPromptMode: 'legacy-search',
        scope: 'jsee',
      }
    );

    expect(exitCode).toBe(0);
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy.mock.calls[0]?.[0]?.message).toContain(
      'Select project (jsee):'
    );
    const output = client.stderr.getFullOutput();
    expect(output).toContain('my-project');
    expect(output).toContain('jsee');
  });

  it('searches accessible teams for explicit project when scope is omitted', async () => {
    const commandsWithContextPrompts = inferCommands({
      projects: {
        inspect: {
          value: 'inspect',
          arguments: {
            'path.idOrName': {
              required: true,
              inferFrom: 'project',
              value: 'name',
            },
          },
          options: {
            'query.teamId': {
              inferFrom: 'team',
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      inspectEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);
    vi.spyOn(linkUtils, 'getLinkFromDir').mockResolvedValue(null);
    vi.spyOn(teamUtils, 'default').mockResolvedValue([
      { id: 'team_vercel', slug: 'vercel', limited: false },
      { id: 'team_jsee', slug: 'jsee', limited: false },
    ] as any);
    vi.spyOn(projectUtils, 'default').mockImplementation(
      async (_client, projectIdOrName, orgId) => {
        if (orgId === 'team_jsee') {
          return { id: projectIdOrName, name: 'my-project' } as any;
        }
        return new ProjectNotFound(String(projectIdOrName));
      }
    );
    client.config.currentTeam = 'vercel';

    const scenario = Router();
    scenario.get('/v9/projects/:idOrName', (req, res) => {
      expect(req.query.teamId).toBe('jsee');
      res.status(200).json({ id: req.params.idOrName });
    });
    client.useScenario(scenario);

    const exitCode = await runInferredCommand(
      commandsWithContextPrompts,
      ['projects', 'inspect', 'prj_other_team'],
      {
        client,
        api: client.apiUrl,
      }
    );

    expect(exitCode).toBe(0);
  });

  it('prints searched teams when explicit project is not found in accessible teams', async () => {
    const commandsWithContextPrompts = inferCommands({
      projects: {
        inspect: {
          value: 'inspect',
          arguments: {
            'path.idOrName': {
              required: true,
              inferFrom: 'project',
              value: 'name',
            },
          },
          options: {
            'query.teamId': {
              inferFrom: 'team',
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      inspectEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);
    vi.spyOn(linkUtils, 'getLinkFromDir').mockResolvedValue(null);
    vi.spyOn(teamUtils, 'default').mockResolvedValue([
      { id: 'team_vercel', slug: 'vercel', limited: false },
      { id: 'team_private', slug: 'private-team', limited: true },
      { id: 'team_jsee', slug: 'jsee', limited: false },
    ] as any);
    vi.spyOn(projectUtils, 'default').mockResolvedValue(
      new ProjectNotFound('prj_missing')
    );
    client.config.currentTeam = 'vercel';
    const previousNonInteractive = client.nonInteractive;
    client.nonInteractive = true;
    try {
      const exitCode = await runInferredCommand(
        commandsWithContextPrompts,
        ['projects', 'inspect', 'prj_missing'],
        {
          client,
          api: client.apiUrl,
        }
      );

      expect(exitCode).toBe(1);
      const output = client.stderr.getFullOutput();
      expect(output).toContain(
        'Project "prj_missing" was not found in accessible teams.'
      );
      expect(output).toContain('Searched teams (non-limited):');
      expect(output).toContain('vercel');
      expect(output).toContain('jsee');
      expect(output).not.toContain('private-team');
    } finally {
      client.nonInteractive = previousNonInteractive;
    }
  });

  it('supports built-in deployments filter using project and team scope', async () => {
    const commandsWithDeploymentFilter = inferCommands({
      deployments: {
        getDeployment: {
          value: 'inspect',
          arguments: {
            'path.id': {
              required: true,
              filter: 'deployments',
            },
          },
          options: {
            'query.teamId': {
              inferFrom: 'team',
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      inspectDeploymentEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);
    vi.spyOn(linkUtils, 'getLinkFromDir').mockResolvedValue({
      projectId: 'prj_from_context',
      orgId: 'team_from_context',
    });

    client.scenario.get('/v6/deployments', (req, res) => {
      expect(req.query.teamId).toBe('jsee');
      expect(req.query.projectId).toBe('prj_from_context');
      res.json({
        deployments: [
          {
            id: 'dpl_123',
            name: 'my-deployment',
            createdAt: Date.now(),
          },
        ],
      });
    });

    const searchSpy = vi
      .spyOn(client.input, 'search')
      .mockResolvedValueOnce('dpl_123');

    const exitCode = await runInferredCommand(
      commandsWithDeploymentFilter,
      ['deployments', 'inspect', '--dry-run'],
      {
        client,
        api: client.apiUrl,
        scope: 'jsee',
        projectPromptMode: 'legacy-search',
      }
    );

    expect(exitCode).toBe(0);
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy.mock.calls[0]?.[0]?.message).toContain(
      'Select deployment'
    );
    const output = client.stderr.getFullOutput();
    expect(output).toContain('dpl_123');
  });

  it('prompts for project first, then loads deployments for that project', async () => {
    const commandsWithDeploymentFilter = inferCommands({
      deployments: {
        getDeployment: {
          value: 'inspect',
          arguments: {
            'path.id': {
              required: true,
              filter: 'deployments',
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      inspectDeploymentEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);
    vi.spyOn(linkUtils, 'getLinkFromDir').mockResolvedValue(null);

    const deploymentQueryCalls: Array<{
      projectId: string | undefined;
      app: string | undefined;
      teamId: string | undefined;
    }> = [];
    client.scenario.get('/v6/deployments', (req, res) => {
      deploymentQueryCalls.push({
        projectId:
          typeof req.query.projectId === 'string'
            ? req.query.projectId
            : undefined,
        app: typeof req.query.app === 'string' ? req.query.app : undefined,
        teamId:
          typeof req.query.teamId === 'string' ? req.query.teamId : undefined,
      });

      if (req.query.app === 'my-project') {
        return res.json({
          deployments: [
            {
              id: 'dpl_abc123',
              name: 'my-deployment',
              createdAt: Date.now(),
            },
          ],
        });
      }

      return res.json({ deployments: [] });
    });

    const searchSpy = vi
      .spyOn(client.input, 'search')
      .mockResolvedValueOnce('my-project')
      .mockResolvedValueOnce('dpl_abc123');

    const exitCode = await runInferredCommand(
      commandsWithDeploymentFilter,
      ['deployments', 'inspect', '--dry-run'],
      {
        client,
        api: client.apiUrl,
        scope: 'jsee',
        projectPromptMode: 'legacy-search',
      }
    );

    expect(exitCode).toBe(0);
    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(searchSpy.mock.calls[0]?.[0]?.message).toContain(
      'Select project (jsee):'
    );
    expect(searchSpy.mock.calls[1]?.[0]?.message).toContain(
      'Select deployment (jsee/my-project):'
    );
    const searchConfig = searchSpy.mock.calls[1]?.[0];
    const idMatches = await searchConfig?.source?.('dpl_abc', {
      signal: new AbortController().signal,
    });
    expect(
      idMatches?.some((choice: any) => choice.value === 'dpl_abc123')
    ).toBe(true);
    const nameMatches = await searchConfig?.source?.('my-deployment', {
      signal: new AbortController().signal,
    });
    expect(nameMatches).toEqual([]);
    expect(deploymentQueryCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId: undefined,
          app: 'my-project',
          teamId: 'jsee',
        }),
      ])
    );
    const output = client.stderr.getFullOutput();
    expect(output).toContain('dpl_abc123');
  });

  it('fails early with project inference guidance when project context is missing', async () => {
    const commandsWithProjectInference = inferCommands({
      projects: {
        inspect: {
          value: 'inspect',
          arguments: {
            'path.idOrName': {
              required: true,
              inferFrom: 'project',
              value: 'name',
            },
          },
        },
      },
    });

    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      inspectEndpoint,
    ]);
    vi.spyOn(OpenApiCache.prototype, 'getBodyFields').mockReturnValue([]);
    vi.spyOn(linkUtils, 'getLinkFromDir').mockResolvedValue(null);
    client.nonInteractive = true;

    const exitCode = await runInferredCommand(
      commandsWithProjectInference,
      ['projects', 'inspect'],
      {
        client,
        api: client.apiUrl,
      }
    );

    expect(exitCode).toBe(1);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Missing required inputs for inferred command.');
    expect(output).toContain('name');
    expect(output).toContain(
      'Could not infer a project from the current context.'
    );
    expect(output).toContain('linked project directory');
  });
});
