import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import {
  permissionsLsSubcommand,
  permissionsAddSubcommand,
  permissionsRmSubcommand,
  permissionsClearSubcommand,
} from '../../../src/commands/vcr/permissions/command';
import { commandsStructs } from '../../../src/commands';
import {
  buildCommandSynopsisLine,
  help,
  type Command,
} from '../../../src/commands/help';
import {
  firewallCommand,
  rulesAddSubcommand,
} from '../../../src/commands/firewall/command';

// Every synopsis path, including parent arguments before a child command, at which each command object appears in the registered tree.
// A subcommand object can be shared by two trees (for example
// `integration resource` and `integration-resource`).
function collectPaths(): Map<Command, string[]> {
  const paths = new Map<Command, string[]>();
  const visit = (command: Command, parentPath: string[]) => {
    const path = [...parentPath, command.name];
    paths.set(command, [...(paths.get(command) ?? []), path.join(' ')]);
    const childPath = command.argumentsBeforeSubcommand
      ? [
          ...path,
          ...command.arguments.map(arg =>
            arg.required
              ? `<${arg.name}>${arg.multiple ? '...' : ''}`
              : `[${arg.name}]${arg.multiple ? '...' : ''}`
          ),
        ]
      : path;
    for (const subcommand of command.subcommands ?? []) {
      visit(subcommand, childPath);
    }
  };
  for (const command of commandsStructs) {
    if ('options' in command) {
      visit(command as Command, []);
    }
  }
  return paths;
}

function synopsisStartsWithOneOf(synopsis: string, commandPaths: string[]) {
  const line = stripAnsi(synopsis).trim();
  return commandPaths.some(
    path => line === `▲ vercel ${path}` || line.startsWith(`▲ vercel ${path} `)
  );
}

describe('help synopsis', () => {
  it.each([
    [true, false, '<domain>'],
    [false, false, '[domain]'],
    [true, true, '<domain>...'],
    [false, true, '[domain]...'],
  ] as const)('renders required=%s multiple=%s as %s', (required, multiple, expected) => {
    const command: Command = {
      name: 'example',
      aliases: [],
      description: 'Example',
      arguments: [
        {
          name: 'domain',
          required,
          ...(multiple ? { multiple: true as const } : {}),
        },
      ],
      options: [],
      examples: [],
    };
    expect(stripAnsi(buildCommandSynopsisLine(command))).toBe(
      `▲ vercel example ${expected}`
    );
    expect(
      stripAnsi(
        help(
          {
            ...command,
            name: 'group',
            subcommands: [{ ...command, name: 'check' }],
          },
          { stream: { isTTY: false }, columns: 80 }
        )
      )
    ).toContain(`  check ${expected}`);
  });

  it.each([
    permissionsLsSubcommand,
    permissionsAddSubcommand,
    permissionsRmSubcommand,
    permissionsClearSubcommand,
  ])('retains the repository before permissions $name', command => {
    expect(stripAnsi(buildCommandSynopsisLine(command))).toContain(
      `▲ vercel vcr permissions <repository> ${command.name}`
    );
  });

  const paths = collectPaths();

  it.each(
    [...paths.entries()].map(([command, commandPaths]) => [
      commandPaths[0],
      command,
      commandPaths,
    ])
  )('renders the full command path for %s', (_name, command, commandPaths) => {
    const synopsis = buildCommandSynopsisLine(command);
    expect(
      synopsisStartsWithOneOf(synopsis, commandPaths),
      `${stripAnsi(synopsis).trim()} should start with vercel ${commandPaths.join(' | ')}`
    ).toBe(true);
  });

  it('ignores a partial parent passed by the caller', () => {
    const output = help(rulesAddSubcommand, {
      stream: { isTTY: false },
      parent: firewallCommand,
      columns: 120,
    });
    expect(stripAnsi(output)).toContain('▲ vercel firewall rules add');
  });
});
