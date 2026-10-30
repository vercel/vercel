import { beforeEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import { client } from '../../mocks/client';
import { printError } from '../../../src/util/error';
import { parseArguments } from '../../../src/util/get-args';
import { exitWithNonInteractiveError } from '../../../src/util/agent-output';
import { APIError } from '../../../src/util/errors-ts';
import { Response } from '../../../src/util/fetch-primitives';
import {
  errorContext,
  getErrorRecovery,
} from '../../../src/util/error-recovery';
import getTeamByIdOrSlug, {
  teamCache,
} from '../../../src/util/teams/get-team-by-id-or-slug';
import getUser from '../../../src/util/get-user';
import { useTeam } from '../../mocks/team';
import { useUser } from '../../mocks/user';
import { handleApiError } from '../../../src/commands/metrics/output';
import { handleCommandTypo } from '../../../src/util/handle-command-typo';
import { commandsStructs } from '../../../src/commands';
import { deployCommand } from '../../../src/commands/deploy/command';
import { projectCommand } from '../../../src/commands/project/command';
import { getFlagsSpecification } from '../../../src/util/get-flags-specification';
import {
  buildCorrectedCommand,
  suggestCorrection,
} from '../../../src/util/command-correction';
import {
  trackAgentCommandOutcome,
  trackAgentError,
} from '../../../src/util/telemetry/agent-error';

beforeEach(() => client.reset());

describe('agent error recovery', () => {
  it('explains permission failures with the selected team and required access', async () => {
    client.nonInteractive = true;
    client.setArgv('connect', 'list', '--team', 'acme');
    const team = useTeam('team_acme');
    team.slug = 'acme';
    client.config.currentTeam = team.id;
    await getTeamByIdOrSlug(client, team.id);
    printError(
      new APIError('Permission denied.', new Response('', { status: 403 }), {
        action: 'read',
        resource: 'connector',
      }),
      client
    );
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result).toMatchObject({
      reason: 'forbidden',
      scope: 'acme',
      action: 'read',
      resource: 'connector',
      retryable: false,
      userActionRequired: true,
    });
    expect(result.hint).toContain('team owner');
    expect(result.hint).toContain('(acme)');
    expect(client.stdout.getFullOutput()).not.toContain('team_acme');
    expect(result.next).toBeUndefined();
    expect(client.stdout.getFullOutput()).not.toContain('vercel link');
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('uses a cached team list without making requests during error reporting', async () => {
    const team = useTeam('team_acme');
    team.slug = 'acme';
    client.config.currentTeam = team.id;
    client.teams = [await getTeamByIdOrSlug(client, team.id)];
    teamCache.clear();
    const fetch = vi.spyOn(client, 'fetch');
    try {
      expect(errorContext(client)).toBe('acme');
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it('omits unresolved teams instead of reporting an ID or the personal account', async () => {
    useUser({ username: 'alice' });
    await getUser(client);
    expect(errorContext(client)).toBe('alice');
    client.config.currentTeam = 'team_unknown';
    expect(errorContext(client)).toBeUndefined();
    const recovery = getErrorRecovery({ status: 403 }, client);
    expect(recovery.scope).toBeUndefined();
    expect(recovery.hint).not.toContain('team_unknown');
    expect(recovery.hint).not.toContain('alice');
  });

  it('preserves Retry-After and removes project defaults from a rate-limit error', () => {
    client.nonInteractive = true;
    client.setArgv('project', 'inspect', 'web');
    const error = new APIError(
      'Too many requests.',
      new Response('', { status: 429, headers: { 'Retry-After': '20' } })
    );
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    try {
      expect(() => exitWithNonInteractiveError(client, error)).toThrow('exit');
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.retryAfterMs).toBe(20000);
      expect(result.hint).toContain('20 seconds');
      expect(result.next).toBeUndefined();
      expect(result.hint).not.toContain('linked');
    } finally {
      exit.mockRestore();
    }
  });

  it('does not invent an immediate retry time when the server omitted it', () => {
    expect(
      getErrorRecovery({ status: 429, retryAfterMs: 0 }).retryAfterMs
    ).toBeUndefined();
    expect(
      getErrorRecovery({ status: 429, retryAfterMs: 'never' }).retryable
    ).toBe(false);
  });

  it('does not suggest buying a subscription when Observability Plus is disabled', () => {
    handleApiError(
      {
        status: 402,
        serverMessage:
          'Observability Plus was disabled for this team. Re-enable it to run this query.',
      },
      true,
      client
    );
    const result = JSON.parse(client.stdout.getFullOutput()).error;
    expect(result.hint).toContain('enable it');
    expect(result.retryable).toBe(false);
    expect(result.next).toBeUndefined();
    expect(client.stdout.getFullOutput()).not.toContain('buy addon');
  });

  it('includes conditional billing instructions in JSON without carrying confirmation flags', () => {
    client.setArgv('metrics', '--team', 'acme', '--yes');
    handleApiError(
      { status: 402, serverMessage: 'Observability Plus is required.' },
      true,
      client
    );
    const result = JSON.parse(client.stdout.getFullOutput()).error;
    expect(result.hint).toContain('already subscribed');
    expect(result.next[0].command).toContain('buy addon observability-plus');
    expect(result.next[0].command).toContain('--team acme');
    expect(result.next[0].command).not.toContain('--yes');
    expect(result.next[0].when).toContain('approved');
  });

  it('keeps another product or a quota refusal separate from Observability Plus', () => {
    for (const message of [
      'Analytics custom events require an Enterprise or Pro plan.',
      'You have reached the daily observability metrics query limit.',
    ]) {
      const recovery = getErrorRecovery({
        status: 402,
        serverMessage: message,
      });
      expect(recovery.hint).not.toContain('buy addon');
      expect(recovery.retryable).toBe(false);
    }
  });
});

describe('command corrections', () => {
  it('never trusts API response fields as locally verified command options', () => {
    client.nonInteractive = true;
    client.setArgv('project', 'inspect', 'web');
    printError(
      new APIError('Permission denied.', new Response('', { status: 403 }), {
        code: 'ARG_UNKNOWN_OPTION',
        allowedOptions: ['--remote-option'],
        invalidOption: 'inspect',
        suggestedOption: 'remove',
      }),
      client
    );
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result.reason).toBe('forbidden');
    expect(result.allowedOptions).toBeUndefined();
    expect(result.suggestedOption).toBeUndefined();
    expect(result.next).toBeUndefined();
  });
  it('corrects a misspelled option using the options accepted by this command', () => {
    client.nonInteractive = true;
    client.setArgv(
      'project',
      'inspect',
      'web',
      '--formats',
      'json',
      '--team',
      'acme'
    );
    try {
      parseArguments(['web', '--formats', 'json'], { '--format': String });
    } catch (error) {
      printError(error, client);
    }
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result.allowedOptions).toContain('--format');
    expect(result.suggestedOption).toBe('--format');
    expect(result.next[0].command).toBe(
      'vercel project inspect web --format json --team acme'
    );
    expect(result.cliVersion).toBeTruthy();
  });

  it('suggests a full command for an unambiguous transposition', () => {
    client.nonInteractive = true;
    client.setArgv('project', 'insepct', 'web');
    expect(
      handleCommandTypo({
        client,
        command: 'insepct',
        availableCommands: projectCommand.subcommands,
      })
    ).toBe(true);
    expect(JSON.parse(client.stdout.getFullOutput()).next[0].command).toBe(
      'vercel project inspect web'
    );
  });

  it.each([
    '--skip-domain',
    '--prebuilt',
    '--prod',
    '-d',
    '--version',
  ])('preserves the deployment directory after %s in a command correction', flag => {
    client.nonInteractive = true;
    client.setArgv('deply', flag, 'my-app');
    expect(
      handleCommandTypo({
        client,
        command: 'deply',
        availableCommands: commandsStructs,
      })
    ).toBe(true);
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result.next[0].command).toBe(`vercel deploy ${flag} my-app`);
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('uses the parser specification for boolean flags around an option correction', () => {
    client.nonInteractive = true;
    client.setArgv('deploy', '--prebuit', '--skip-domain', 'my-app', '-d');
    try {
      parseArguments(
        client.argv.slice(2),
        getFlagsSpecification(deployCommand.options)
      );
    } catch (error) {
      printError(error, client);
    }
    expect(JSON.parse(client.stdout.getFullOutput()).next[0].command).toBe(
      'vercel deploy --prebuilt --skip-domain my-app -d'
    );
  });

  it('preserves a directory while redacting values and skipping matching flag values', () => {
    const result = buildCorrectedCommand(
      [
        'node',
        'vc',
        '--name',
        'deply',
        'deply',
        '--prebuilt',
        'my app',
        '--env',
        'SECRET=private-value',
        '--token',
        'private-token',
      ],
      'deply',
      'deploy',
      getFlagsSpecification(deployCommand.options)
    );
    expect(result).toBe(
      "vercel --name '<value>' deploy --prebuilt 'my app' --env '<value>'"
    );
    expect(result).not.toContain('private-value');
    expect(result).not.toContain('private-token');
  });

  it.each([
    false,
    true,
  ])('keeps a likely typo suggestion without a runnable command (non-interactive=%s)', nonInteractive => {
    client.nonInteractive = nonInteractive;
    client.setArgv('deploooy');
    expect(suggestCorrection('deploooy', ['deploy'])).toBeUndefined();
    expect(
      handleCommandTypo({
        client,
        command: 'deploooy',
        availableCommands: [deployCommand],
      })
    ).toBe(true);
    if (nonInteractive) {
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.message).toBe(
        'Unknown command "deploooy". Did you mean "deploy"?'
      );
      expect(result.next).toBeUndefined();
      expect(client.stderr.getFullOutput()).toBe('');
    } else {
      expect(client.stderr.getFullOutput()).toContain('Did you mean "deploy"?');
      expect(client.stdout.getFullOutput()).toBe('');
    }
    expect(
      client.stdout.getFullOutput() + client.stderr.getFullOutput()
    ).not.toContain('No unambiguous correction was found');
  });

  it('points to help instead of listing every command', () => {
    client.setArgv('search');
    expect(
      handleCommandTypo({
        client,
        command: 'search',
        availableCommands: commandsStructs,
      })
    ).toBe(true);
    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr).toContain('Unknown command "search". Did you mean "cache"?');
    expect(stderr).not.toContain('Accepted commands');
    expect(stderr).not.toContain('`');
    expect(stderr.endsWith('\n  See all commands:\n    vercel --help\n')).toBe(
      true
    );
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('keeps the corrected command before the help command', () => {
    client.setArgv('deplyo');
    expect(
      handleCommandTypo({
        client,
        command: 'deplyo',
        availableCommands: commandsStructs,
      })
    ).toBe(true);
    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr).toMatch(
      /Unknown command "deplyo"\. Did you mean "deploy"\?\n *vercel deploy\n/
    );
    expect(stderr.endsWith('\n  See all commands:\n    vercel --help\n')).toBe(
      true
    );
  });

  it('points to the help of the group the subcommand is in', () => {
    client.setArgv('project', 'lis');
    expect(
      handleCommandTypo({
        client,
        command: 'lis',
        availableCommands: projectCommand.subcommands,
        helpCommand: 'project --help',
      })
    ).toBe(true);
    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr).not.toContain('Accepted commands');
    expect(
      stderr.endsWith('\n  See all commands:\n    vercel project --help\n')
    ).toBe(true);
  });

  it('keeps the JSON error as it was', () => {
    client.nonInteractive = true;
    client.setArgv('search');
    expect(
      handleCommandTypo({
        client,
        command: 'search',
        availableCommands: commandsStructs,
      })
    ).toBe(true);
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result.message).toBe(
      'Unknown command "search". Did you mean "cache"?'
    );
    expect(result.hint).toMatch(/^Accepted commands: .*\bdeploy\b/);
    expect(result.next).toBeUndefined();
  });

  it('keeps command aliases in the list of possible suggestions', () => {
    client.nonInteractive = true;
    client.setArgv('project', 'rmm', 'my-app');
    expect(
      handleCommandTypo({
        client,
        command: 'rmm',
        availableCommands: projectCommand.subcommands,
      })
    ).toBe(true);
    expect(JSON.parse(client.stdout.getFullOutput()).next[0].command).toBe(
      "vercel project rm '<argument>'"
    );
  });

  it('excludes hidden commands from suggestions', () => {
    client.nonInteractive = true;
    client.setArgv('experiment');

    expect(
      handleCommandTypo({
        client,
        command: 'experiment',
        availableCommands: commandsStructs,
      })
    ).toBe(false);
    expect(client.stdout.getFullOutput()).toBe('');
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('does not guess between equally plausible corrections or distant options', () => {
    expect(suggestCorrection('--foos', ['--foo', '--food'])).toBeUndefined();
    expect(suggestCorrection('--format', ['--force'])).toBeUndefined();
  });

  it('quotes context and masks credentials and unknown values', () => {
    const result = buildCorrectedCommand(
      [
        'node',
        'vc',
        'env',
        'add',
        'SECRET',
        '--valu',
        'private-value',
        '--token=private-token',
        '--cwd',
        '/tmp/a; echo bad',
      ],
      '--valu',
      '--value'
    );
    expect(result).not.toContain('private-value');
    expect(result).not.toContain('private-token');
    expect(result).toContain("--cwd '/tmp/a; echo bad'");
    expect(result).toContain("--value '<value>'");
  });

  it('does not replace a matching string inside a flag value', () => {
    expect(
      buildCorrectedCommand(
        ['node', 'vc', '--cwd', 'insepct', 'project', 'insepct', 'web'],
        'insepct',
        'inspect'
      )
    ).toBe('vercel --cwd insepct project inspect web');
    expect(
      buildCorrectedCommand(
        [
          'node',
          'vc',
          'project',
          'inspect',
          'web',
          '--name',
          '--formats',
          '--formats',
          'json',
        ],
        '--formats',
        '--format',
        { '--name': String, '--format': String }
      )
    ).toContain('--format json');
  });

  it('never copies an attached short token into a correction', () => {
    expect(
      buildCorrectedCommand(
        ['node', 'vc', 'project', 'insepct', 'web', '-tprivate-token'],
        'insepct',
        'inspect'
      )
    ).not.toContain('private-token');
  });

  it('masks attached header values in suggestions', () => {
    expect(
      buildCorrectedCommand(
        ['node', 'vc', 'api', '/test', '--formats', 'json', '-Hprivate-header'],
        '--formats',
        '--format'
      )
    ).not.toContain('private-header');
  });

  it('keeps the value of -n wherever it means --limit', () => {
    const correct = (...args: string[]) =>
      buildCorrectedCommand(
        ['node', 'vc', 'project', 'lst', ...args],
        'lst',
        'list',
        getFlagsSpecification(
          projectCommand.subcommands.find(({ name }) => name === 'list')!
            .options
        )
      );
    expect(correct('-n', '5')).toBe('vercel project list -n 5');
    expect(correct('--limit', '5')).toBe('vercel project list --limit 5');
    // `-n` is the hidden `--name` here, whose value is never copied.
    expect(
      buildCorrectedCommand(
        ['node', 'vc', 'integration', 'ad', 'acme', '-n', 'private-name'],
        'ad',
        'add',
        { '--name': String, '-n': '--name' }
      )
    ).not.toContain('private-name');
  });
});

describe('agent error tracking', () => {
  it('records the invocation and a fixed category without the error text', () => {
    client.isAgent = true;
    const add = vi.spyOn(client.telemetryEventStore, 'add');
    trackAgentError(client, {
      reason: 'forbidden',
      hint: 'private customer detail',
      retryable: false,
    });
    const event = add.mock.calls.at(-1)![0];
    expect(event.key).toBe('agent_error');
    expect(JSON.parse(event.value)).toMatchObject({
      invocationId: client.telemetryEventStore.currentInvocationId,
      category: 'permission',
      hasRecovery: true,
      retryable: false,
    });
    expect(event.value).not.toContain('private customer detail');
    add.mockRestore();
  });

  it('distinguishes a help exit from a failure', () => {
    client.isAgent = true;
    client.setArgv('domains', '--help');
    const add = vi.spyOn(client.telemetryEventStore, 'add');
    trackAgentCommandOutcome(client, 2);
    expect(JSON.parse(add.mock.calls.at(-1)![0].value).outcome).toBe('help');
    trackAgentCommandOutcome(client, 1);
    expect(JSON.parse(add.mock.calls.at(-1)![0].value).outcome).toBe('failure');
    add.mockRestore();
  });

  it('does not count help passed to a child command as CLI help', () => {
    client.isAgent = true;
    client.setArgv('env', 'run', '--', 'node', '--help');
    const add = vi.spyOn(client.telemetryEventStore, 'add');
    trackAgentCommandOutcome(client, 0);
    expect(JSON.parse(add.mock.calls.at(-1)![0].value).outcome).toBe('success');
    add.mockRestore();
  });
});
