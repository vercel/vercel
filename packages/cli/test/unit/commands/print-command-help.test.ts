import { beforeEach, describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import { client } from '../../mocks/client';
import { commandsStructs } from '../../../src/commands';
import { getCommandPath, type Command } from '../../../src/commands/help';
import {
  asksForVersion,
  deployAcceptsOptions,
  getCommandPathOptions,
  printCommandHelp,
  printGroupHelp,
  printUnknownCommand,
  tokensAfterCommand,
} from '../../../src/commands/print-command-help';

// Commands that still render their own help at runtime.
const SELF_RENDERED_HELP = new Set([
  'connect create',
  'install',
  'integration add',
  'sandbox',
]);

interface HelpCase {
  path: string;
  typed: string[];
  command: Command;
}

// Every registered command, reached through its canonical name and through
// each of its aliases.
function collectCases(): HelpCase[] {
  const cases: HelpCase[] = [];
  const visit = (
    command: Command,
    path: string[],
    typedPaths: string[][]
  ): void => {
    for (const typed of typedPaths) {
      cases.push({ path: path.join(' '), typed, command });
    }
    for (const subcommand of command.subcommands ?? []) {
      const names = [subcommand.name, ...subcommand.aliases];
      visit(
        subcommand,
        [...path, subcommand.name],
        [
          ...names.map(name => [...typedPaths[0], name]),
          ...typedPaths.slice(1).map(typed => [...typed, subcommand.name]),
        ]
      );
    }
  };
  for (const root of commandsStructs) {
    if ('options' in root) {
      const command = root as Command;
      // A shortcut that names one of the command's subcommands, such as
      // `switch` for `teams switch`, runs that subcommand; it has its own test.
      const aliases = command.aliases.filter(
        alias =>
          !command.subcommands?.some(
            subcommand =>
              subcommand.name === alias || subcommand.aliases.includes(alias)
          )
      );
      visit(
        command,
        [command.name],
        [command.name, ...aliases].map(name => [name])
      );
    }
  }
  return cases;
}

describe('printCommandHelp', () => {
  beforeEach(() => {
    client.reset();
  });

  it('prints the resolved command help on stdout', () => {
    expect(printCommandHelp(client, 'firewall', ['rules', 'add'])).toBe(0);
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      '▲ vercel firewall rules add'
    );
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('records the help flag with the typed subcommands', () => {
    expect(printCommandHelp(client, 'alias', ['ls'])).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'alias:ls' },
    ]);
  });

  it('records the full path for nested commands', () => {
    expect(printCommandHelp(client, 'firewall', ['rules', 'add'])).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'firewall:rules:add' },
    ]);
  });

  it('leaves commands that render their own help alone', () => {
    expect(printCommandHelp(client, 'sandbox', [])).toBeUndefined();
    expect(
      printCommandHelp(client, 'integration', ['add', 'neon'])
    ).toBeUndefined();
    expect(
      printCommandHelp(client, 'connect', ['create', 'slack'])
    ).toBeUndefined();
    expect(printCommandHelp(client, 'not-a-command', [])).toBeUndefined();
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('shows the subcommand a shortcut names, as `vercel switch` does', () => {
    expect(printCommandHelp(client, 'switch', ['--help'])).toBe(0);
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      '▲ vercel teams switch'
    );
  });

  it('fails with exit code 2 for a subcommand that does not exist', () => {
    expect(printCommandHelp(client, 'env', ['nope', '--help'])).toBe(2);
    expect(client.stdout.getFullOutput()).toBe('');
    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr).toContain('Unknown command nope for vercel env.');
    expect(stderr).toContain('vercel env --help');
  });

  it('names the deepest group that exists for a nested unknown subcommand', () => {
    expect(printCommandHelp(client, 'firewall', ['rules', 'nope'])).toBe(2);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Unknown command nope for vercel firewall rules.'
    );
  });

  it('treats a token after a command that takes arguments as an argument', () => {
    expect(printCommandHelp(client, 'kms', ['my-issuer', '--help'])).toBe(0);
    expect(printCommandHelp(client, 'promote', ['dpl_123', '--help'])).toBe(0);
    expect(client.stderr.getFullOutput()).toBe('');
  });

  // The entry point calls printCommandHelp before any command runs, so a
  // command's own `--help` handling is only reached when this returns
  // undefined.
  describe('answers --help for every registered command', () => {
    it.each(
      collectCases().map(({ path, typed, command }) => [
        typed.join(' '),
        path,
        command,
        typed,
      ]) as [string, string, Command, string[]][]
    )('vercel %s --help', (_name, path, command, typed) => {
      const [commandName, ...tokens] = typed;
      const printed = printCommandHelp(client, commandName, [
        ...tokens,
        '--help',
      ]);
      const selfRendered = [...SELF_RENDERED_HELP].some(
        name => path === name || path.startsWith(`${name} `)
      );

      expect(printed).toBe(selfRendered ? undefined : 0);
      if (printed === 0) {
        // A command shared by two trees shows its canonical path.
        const canonicalPath = getCommandPath(command).join(' ');
        expect(
          stripAnsi(client.stdout.getFullOutput())
            .split('\n')[0]
            .replace(/ <[^>]+>(?:\.\.\.)?/g, '')
        ).toMatch(
          new RegExp(
            `^\\s*▲ vercel ${canonicalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`,
            'm'
          )
        );
        expect(client.stderr.getFullOutput()).toBe('');
        expect(command.dynamicHelp).toBeUndefined();
      }
    });
  });
});

// Every group, reached through its canonical path.
function collectGroups(): Command[][] {
  const groups: Command[][] = [];
  const visit = (path: Command[]): void => {
    const command = path[path.length - 1];
    if (command.subcommands?.length) {
      groups.push(path);
    }
    for (const subcommand of command.subcommands ?? []) {
      visit([...path, subcommand]);
    }
  };
  for (const root of commandsStructs) {
    if ('options' in root && root.name !== 'sandbox') {
      visit([root as Command]);
    }
  }
  return groups;
}

describe('printGroupHelp', () => {
  beforeEach(() => {
    client.reset();
  });

  it('prints the help of a group run without a subcommand on stdout', () => {
    expect(printGroupHelp(client, 'firewall', ['rules'])).toBe(0);
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      '▲ vercel firewall rules'
    );
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it('accepts global options alongside the group', () => {
    expect(printGroupHelp(client, 'env', ['--debug'])).toBe(0);
  });

  it('fails with exit code 2 for an option the group does not accept', () => {
    expect(printGroupHelp(client, 'env', ['--nope'])).toBe(2);
    expect(client.stdout.getFullOutput()).toBe('');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'unknown or unexpected option: --nope'
    );
  });

  it('runs the subcommand a shortcut names, as `vercel switch` does', () => {
    expect(printGroupHelp(client, 'switch', [])).toBeUndefined();
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('leaves commands that do work alone', () => {
    expect(printGroupHelp(client, 'env', ['ls'])).toBeUndefined();
    expect(printGroupHelp(client, 'env', ['nope'])).toBeUndefined();
    expect(printGroupHelp(client, 'whoami', [])).toBeUndefined();
    expect(printGroupHelp(client, 'not-a-command', [])).toBeUndefined();
    expect(printGroupHelp(client, 'sandbox', [])).toBeUndefined();
    expect(client.stdout.getFullOutput()).toBe('');
  });

  describe('answers every group run without a subcommand', () => {
    it.each(
      collectGroups().map(path => [
        path.map(command => command.name).join(' '),
        path,
      ]) as [string, Command[]][]
    )('vercel %s', (_name, path) => {
      const group = path[path.length - 1];
      const [root, ...rest] = path.map(command => command.name);
      const doesWork =
        group.arguments.length > 0 ||
        group.runsWithoutSubcommand === true ||
        (group.subcommands ?? []).some(subcommand => subcommand.default);

      expect(printGroupHelp(client, root, rest)).toBe(doesWork ? undefined : 0);
      expect(client.stdout.getFullOutput() === '').toBe(doesWork);
    });
  });
});

describe('printUnknownCommand', () => {
  beforeEach(() => {
    client.reset();
  });

  it('points to root help for an unknown top-level command', () => {
    printUnknownCommand(client, 'nope');
    const stderr = stripAnsi(client.stderr.getFullOutput());
    expect(stderr).toContain('Unknown command nope for vercel.');
    expect(stderr).toContain('vercel --help');
    expect(stderr).toContain('\n    vercel --help\n');
    expect(stderr).not.toMatch(/`|^\s*\$ /m);
  });

  it('writes a JSON error in non-interactive mode', () => {
    client.nonInteractive = true;
    printUnknownCommand(client, 'nope', ['env']);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'unknown_command',
      message: 'Unknown command nope for vercel env.',
      next: [{ command: 'vercel env --help' }],
    });
  });
});

describe('tokensAfterCommand', () => {
  it.each([
    [
      ['flags', 'create', '--help'],
      ['create', '--help'],
    ],
    [
      ['flags', '-d', 'Checkout experiment', 'create', '-h'],
      ['-d', 'Checkout experiment', 'create', '-h'],
    ],
    [
      ['--scope', 'acme', 'firewall', 'rules', '--help'],
      ['rules', '--help'],
    ],
    [
      ['-d', 'alias', 'ls', '-h'],
      ['ls', '-h'],
    ],
    [['--token=abc', 'dns', 'add'], ['add']],
    [['--', 'dns', 'add'], []],
  ])('returns the tokens after the command in %j', (args, expected) => {
    expect(tokensAfterCommand([process.execPath, 'vercel', ...args])).toEqual(
      expected
    );
  });
});

describe('getCommandPathOptions', () => {
  const names = (
    commandName: string | undefined,
    tokens: string[]
  ): string[] | undefined =>
    getCommandPathOptions(commandName, tokens)?.map(option => option.name);

  it('returns the options of the command and each group above it', () => {
    expect(names('domains', ['buy', 'example.com'])).toContain('auto-renew');
    expect(names('deploy', [])).toContain('prod');
    expect(names('firewall', ['rules', 'update', 'my-rule'])).toEqual(
      expect.arrayContaining(['enable', 'no-enable'])
    );
  });

  it('resolves a shortcut and an alias', () => {
    expect(names('ls', [])).toEqual(names('list', []));
    expect(names('project', ['set'])).toContain('fluid-compute');
  });

  it('leaves out commands that are not built in', () => {
    expect(names('not-a-command', [])).toBeUndefined();
    expect(names('sandbox', [])).toBeUndefined();
    expect(names(undefined, [])).toBeUndefined();
  });
});

describe('asksForVersion', () => {
  const asks = (commandName: string | undefined, ...args: string[]) =>
    asksForVersion(commandName, ['node', 'vercel', ...args]);

  it('answers --version and -v at any depth', () => {
    expect(asks('deploy', 'deploy', '--version')).toBe(true);
    expect(asks('env', 'env', 'list', '-v')).toBe(true);
    expect(asks('env', '--version', 'env')).toBe(true);
    expect(asks('flags', 'flags', '-yv')).toBe(true);
    expect(asks('deploy', '--prod', '--version')).toBe(true);
  });

  it('ignores argv without --version or -v', () => {
    expect(asks('deploy', 'deploy')).toBe(false);
    expect(asks('env', 'env', 'run', '--', 'node', '--version')).toBe(false);
    expect(asks('env', 'env', 'add', 'NAME', '--value=--version')).toBe(false);
  });

  it('leaves commands that are not built in alone', () => {
    expect(asks(undefined, 'my-extension', '--version')).toBe(false);
    expect(asks('sandbox', 'sandbox', '--version')).toBe(false);
  });

  it.each([
    ['curl', '/api'],
    ['httpstat', '/api'],
    ['traces', 'create', '/api'],
  ])('leaves -v and --version to the program `%s` runs', (...path) => {
    expect(asks(path[0], ...path, '-v')).toBe(false);
    expect(asks(path[0], ...path, '-sv')).toBe(false);
    expect(asks(path[0], ...path, '--version')).toBe(false);
  });

  // Every command that defines `--version` or `-v` itself keeps reading it.
  const owners: { path: string[]; long: boolean; short: boolean }[] = [];
  const visit = (command: Command, path: string[]) => {
    const long = command.options.some(option => option.name === 'version');
    const short = command.options.some(
      option => option.shorthand === 'v' || option.deprecatedShorthand === 'v'
    );
    if (long || short) {
      owners.push({ path, long, short });
    }
    for (const subcommand of command.subcommands ?? []) {
      visit(subcommand, [...path, subcommand.name]);
    }
  };
  for (const root of commandsStructs) {
    if ('options' in root) {
      visit(root as Command, [root.name]);
    }
  }

  it('finds the commands that define --version or -v', () => {
    expect(owners.map(owner => owner.path.join(' ')).sort()).toEqual([
      'flags create',
      'flags disable',
      'flags rules add',
      'flags rules update',
      'flags set',
      'flags targets add',
      'flags update',
      'redirects list',
    ]);
  });

  it.each(
    owners.map(owner => [owner.path.join(' '), owner] as const)
  )('keeps the option %s defines', (_, { path, long, short }) => {
    expect(asks(path[0], ...path, '--version')).toBe(!long);
    // The global `-v` sets a `--version` the command defines.
    expect(asks(path[0], ...path, '-v')).toBe(!short && !long);
  });
});

describe('deployAcceptsOptions', () => {
  it('accepts options deploy takes', () => {
    expect(
      deployAcceptsOptions(['node', 'vercel', '--prod', '--version'])
    ).toBe(true);
    expect(deployAcceptsOptions(['node', 'vercel', '-v', '--json'])).toBe(true);
  });

  it('rejects an option deploy does not take', () => {
    expect(
      deployAcceptsOptions(['node', 'vercel', '--disable-binary', '--version'])
    ).toBe(false);
  });
});

describe('enable and disable subcommands', () => {
  beforeEach(() => {
    client.reset();
  });

  it.each([
    ['domains', ['auto-renew']],
    ['project', ['observability']],
    ['project', ['priority']],
    ['flags', ['targeting']],
  ])('shows the help of vercel %s %j when run without a subcommand', (root, tokens) => {
    expect(printGroupHelp(client, root, tokens)).toBe(0);
    const stdout = stripAnsi(client.stdout.getFullOutput());
    expect(stdout).toContain('enable');
  });

  it.each([
    ['domains', ['auto-renew', 'example.com', 'on']],
    ['project', ['protection']],
    ['project', ['protection', 'my-app']],
    ['project', ['web-analytics']],
    ['project', ['speed-insights', 'my-app']],
    ['version', ['autoupdate']],
  ])('runs vercel %s %j', (root, tokens) => {
    expect(printGroupHelp(client, root, tokens)).toBeUndefined();
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it.each([
    ['domains', ['auto-renew', 'enable'], 'vercel domains auto-renew enable'],
    ['project', ['protection', 'disable'], 'vercel project protection disable'],
    ['version', ['autoupdate', 'status'], 'vercel version autoupdate status'],
    ['flags', ['targeting', 'enable'], 'vercel flags targeting enable'],
  ])('answers --help for vercel %s %j', (root, tokens, synopsis) => {
    expect(printCommandHelp(client, root, [...tokens, '--help'])).toBe(0);
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(`▲ ${synopsis}`);
  });
});
