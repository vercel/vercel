import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inferCommands,
  resolveInferredCommand,
  runInferredCommand,
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
    expect(client.stdout.getFullOutput()).toContain('"projects"');
    expect(client.stderr.getFullOutput()).not.toContain('"request"');
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
