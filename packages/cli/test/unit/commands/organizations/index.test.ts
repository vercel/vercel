import {
  organizationsCommand,
  teamsSubcommand,
} from '../../../../src/commands/organizations/command';
import { help } from '../../../../src/commands/help';
import { describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import {
  org,
  team,
  run,
  runExpectingAgentExit,
  jsonOutput,
  setupOrganizationsTest,
} from './helpers';

setupOrganizationsTest();

describe('organization command metadata', () => {
  it('exposes reads and mutations at both levels', () => {
    expect(
      organizationsCommand.subcommands.map(command => command.name)
    ).toEqual(['list', 'inspect', 'create', 'update', 'teams']);
    expect(teamsSubcommand.subcommands.map(command => command.name)).toEqual([
      'list',
      'create',
      'add',
    ]);
  });

  it('is registered for every user under its name and singular alias', async () => {
    const { commands } = await import('../../../../src/commands');
    expect(commands.get('organizations')).toBe('organizations');
    expect(commands.get('organization')).toBe('organizations');
    expect(commands.has('orgs')).toBe(false);
    expect(commands.has('org')).toBe(false);
  });

  it('is listed in root help', async () => {
    const { commandsStructs } = await import('../../../../src/commands');
    const { getRootHelpCommands } = await import(
      '../../../../src/commands/root-help'
    );
    expect(
      getRootHelpCommands(commandsStructs).find(row =>
        row.names.includes('organizations')
      )
    ).toMatchObject({ description: 'Manage Vercel organizations' });
  });
});

describe('organization help and parsing', () => {
  it.each([
    ['list', '--unknown'],
    ['list', '--name'],
    ['list', '--next'],
  ])('reports parse errors on stderr for %j', async (...args) => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(await run(...args)).toBe(2);
    expect(client.stderr.getFullOutput()).not.toBe('');
    expect(client.stdout.getFullOutput()).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  describe.each([
    ['delete', org.organizationId],
    ['rm', org.organizationId],
    ['teams', 'delete', org.organizationId, '--child-team', team.teamId],
    ['team', 'rm', org.organizationId, '--child-team', team.teamId],
    ['delete', org.organizationId, '--confirm-id', org.organizationId],
  ])('removed deletion command %j', (...args) => {
    it('prints a usage error in a terminal', async () => {
      client.stdin.isTTY = true;
      client.nonInteractive = false;
      const fetch = vi.spyOn(client, 'fetch');
      const prompt = vi.spyOn(client.input, 'text');

      // Usage failures keep exit code 2, as they do for every command group.
      expect(await run(...args)).toBe(2);
      expect(client.stderr.getFullOutput()).toMatch(
        /Unknown command (delete|rm) for vercel organizations/
      );
      expect(client.stdout.getFullOutput()).toBe('');
      expect(fetch).not.toHaveBeenCalled();
      expect(prompt).not.toHaveBeenCalled();
    });

    it('emits a JSON usage error in agent mode', async () => {
      const fetch = vi.spyOn(client, 'fetch');
      expect(
        await runExpectingAgentExit(...args, '--non-interactive')
      ).toMatchObject({ status: 'error', reason: 'unknown_command' });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // The CLI entry point renders `--help` and bare groups from this metadata.
  it('omits deletion from group help', () => {
    const groupHelp = [
      help(organizationsCommand, { stream: { isTTY: false }, columns: 80 }),
      help(teamsSubcommand, {
        stream: { isTTY: false },
        parent: organizationsCommand,
        columns: 80,
      }),
    ].join('\n');
    expect(groupHelp).not.toMatch(/\bdelete\b|\brm\b|--confirm-id/);
  });

  it('accepts only registered aliases', () => {
    expect(organizationsCommand.aliases).toEqual(['organization']);
    expect(teamsSubcommand.aliases).toEqual(['team']);
    const leafAliases = [
      ...organizationsCommand.subcommands,
      ...teamsSubcommand.subcommands,
    ]
      .filter(command => !('subcommands' in command))
      .flatMap(command => command.aliases);
    expect(leafAliases.every(alias => alias === 'ls')).toBe(true);
  });

  it.each([
    [[], 'Missing command for vercel organizations.'],
    [['teams'], 'Missing command for vercel organizations teams.'],
  ])('reports a missing subcommand for %j as a usage error', async (args, message) => {
    expect(await run(...args)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(message);
  });

  it('documents all enabled commands and nested usage', () => {
    expect(
      help(organizationsCommand, {
        stream: { isTTY: false },
        columns: 80,
      }).replace(/[ \t]+$/gm, '')
    ).toMatchSnapshot();
    for (const command of organizationsCommand.subcommands) {
      expect(
        help(command, {
          stream: { isTTY: false },
          parent: organizationsCommand,
          columns: 80,
        }).replace(/[ \t]+$/gm, '')
      ).toMatchSnapshot(command.name);
    }
    for (const command of teamsSubcommand.subcommands) {
      expect(
        help(command, {
          stream: { isTTY: false },
          parent: { ...teamsSubcommand, name: 'organizations teams' },
          columns: 80,
        }).replace(/[ \t]+$/gm, '')
      ).toMatchSnapshot(`teams ${command.name}`);
    }
  });

  it.each([
    ['unknown'],
    ['teams', 'unknown'],
    ['teams', 'move', org.organizationId, '--child-team', team.teamId],
  ])('rejects unknown subcommand %j with a usage error', async (...args) => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(await run(...args)).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['list', '--slug', 'unexpected'],
    ['teams', 'create', org.organizationId, '--team-id', 'team_wrong'],
    ['teams', 'add', org.organizationId, '--name', 'wrong'],
    ['create', '--slug', 'acme', '--root-team-id', org.teamId],
    ['list', 'extra'],
    ['inspect', org.organizationId, 'extra'],
    ['teams', 'list', org.organizationId, '--next'],
  ])('rejects invalid arguments %j before requests', async (...args) => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(await run(...args)).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an unsupported --format value', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(await run('list', '--format', 'yaml')).toBe(2);
    expect(client.stderr.getFullOutput()).toContain('Invalid output format');
    expect(fetch).not.toHaveBeenCalled();
  });

  // An unsupported format is invalid input, so it reports as JSON like every
  // other rejected flag. Prose on stderr alone leaves an agent with nothing.
  it.each([
    ['list'],
    ['inspect', org.organizationId],
    ['create', '--slug', 'acme'],
    ['update', org.organizationId, '--slug', 'renamed'],
    ['teams', 'list', org.organizationId],
    ['teams', 'create', org.organizationId, '--slug', 'acme-web'],
    ['teams', 'add', org.organizationId, '--child-team', team.teamId],
  ])('reports an unsupported --format value as JSON for %j', async (...args) => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(
      await runExpectingAgentExit(
        ...args,
        '--format',
        'yaml',
        '--non-interactive'
      )
    ).toEqual({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.stringContaining('Invalid output format: "yaml"'),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  // Like every other command group, flags belong after the subcommand. A flag
  // value must never be promoted into a subcommand.
  it('never treats a flag value as a subcommand', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(
      await run(
        '--slug',
        'teams',
        '--name',
        'list',
        'teams',
        'create',
        org.organizationId
      )
    ).toBe(2);
    expect(client.stderr.getFullOutput()).toContain('Unknown command');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts flags after the nested subcommand', async () => {
    client.scenario.post(
      `/v1/organizations/${org.organizationId}/teams`,
      (req, res) => {
        expect(req.body).toEqual({
          mode: 'create',
          slug: 'teams',
          name: 'list',
        });
        res.json(team);
      }
    );
    expect(
      await run(
        'teams',
        'create',
        org.organizationId,
        '--slug',
        'teams',
        '--name',
        'list',
        '--format',
        'json',
        '--yes'
      )
    ).toBe(0);
    expect(jsonOutput()).toEqual({ team, outcome: 'created' });
  });

  it('prints the receipt and the team slug for a nested non-interactive creation', async () => {
    client.scenario.post(
      `/v1/organizations/${org.organizationId}/teams`,
      (_req, res) => res.json(team)
    );
    expect(
      await run(
        'teams',
        'create',
        org.organizationId,
        '--slug',
        'acme-web',
        '--name',
        'Acme Web',
        '--yes',
        '--non-interactive'
      )
    ).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('✓ Created');
    // The slug is the stdout identifier, so `slug=$(vercel …)` works.
    expect(client.stdout.getFullOutput()).toBe('acme-web\n');
  });
});

describe('organization input validation', () => {
  it.each([
    ['create'],
    ['create', '--slug', 'Uppercase'],
    ['create', '--slug', '-acme'],
    ['create', '--slug', 'a'.repeat(49)],
    ['create', '--slug', 'acme', '--name', ' '],
    ['update', org.organizationId],
    ['inspect', '../teams'],
    ['inspect', 'org_abc?teamId=wrong'],
    ['inspect', 'org_%2fabc'],
    ['inspect', 'org_abc\n123'],
    ['inspect', '..'],
  ])('validates %j before any API call', async (...args) => {
    client.config.currentTeam = 'team_root';
    const fetch = vi.spyOn(client, 'fetch');
    expect(await run(...args)).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('organization team input validation', () => {
  it.each([
    ['add', '--team-id', team.teamId],
    ['link', '--child-team', team.teamId],
    ['add', '--slug', 'acme-web'],
    ['add', '--child-team', 'Bad Slug'],
    ['add'],
    ['create', '--slug', 'acme-web'],
    ['create', '--slug', 'acme-web', '--name', 'Acme', '--billing-plan', 'pro'],
  ])('rejects invalid team mutation %j before requests', async (action, ...flags) => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(await run('teams', action, org.organizationId, ...flags)).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });
});
