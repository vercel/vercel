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
            required: 'team',
          },
          'query.slug': {
            required: false,
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

  it('returns null when the command is not configured', () => {
    expect(
      resolveInferredCommand(commands, ['projects', 'inspect'])
    ).toBeNull();
    expect(resolveInferredCommand(commands, ['projects'])).toBeNull();
  });

  it('prints configured tags when help is requested without a tag', async () => {
    const exitCode = await runInferredCommand(commands, ['-h']);
    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Inferred OpenAPI tags');
    expect(output).toContain('projects');
    expect(output).toContain('1 operations');
  });

  it('prints operation ids when only a tag is provided', async () => {
    const exitCode = await runInferredCommand(commands, ['projects']);
    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Inferred OpenAPI operations for "projects"');
    expect(output).toContain('list');
    expect(output).toContain('ls');
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
              required: 'team',
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

    const exitCode = await runInferredCommand(
      commands,
      ['projects', 'ls', '-h'],
      {
        columns: 120,
      }
    );

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('vercel projects ls');
    expect(output).toContain('Global Options');
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
});
