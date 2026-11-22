import { describe, expect, it } from 'vitest';
import { commandsStructs } from '../../../src/commands';
import { resolveHelpTarget, type Command } from '../../../src/commands/help';
import { monitorsCommand } from '../../../src/commands/monitors/command';
import { connexCommand } from '../../../src/commands/connex/command';
import { dnsCommand } from '../../../src/commands/dns/command';
import { firewallCommand } from '../../../src/commands/firewall/command';
import { vcrCommand } from '../../../src/commands/vcr/command';
import { promoteCommand } from '../../../src/commands/promote/command';
import { deployCommand } from '../../../src/commands/deploy/command';
import { apiCommand } from '../../../src/commands/api/command';
import { flagsCommand } from '../../../src/commands/flags/command';
import { linkCommand } from '../../../src/commands/link/command';
import { aiGatewayCommand } from '../../../src/commands/ai-gateway/command';
import { daemonsCommand } from '../../../src/commands/daemons/command';

function resolvedName(
  root: Parameters<typeof resolveHelpTarget>[0],
  tokens: string[]
) {
  const { command, typedPath } = resolveHelpTarget(root, tokens);
  return { name: command.name, typedPath };
}

describe('resolveHelpTarget', () => {
  it('reports a token that names no subcommand of a group', () => {
    expect(
      resolveHelpTarget(firewallCommand, ['rules', 'nope', '--help'])
    ).toMatchObject({ typedPath: ['rules'], unknownSegment: 'nope' });
  });

  it('does not report a token a group with a default subcommand accepts', () => {
    expect(
      resolveHelpTarget(dnsCommand, ['example.com', '--help']).unknownSegment
    ).toBeUndefined();
  });

  it('does not report a token for a command that runs without a subcommand', () => {
    // `vc link <dir>` is deprecated but still runs.
    expect(
      resolveHelpTarget(linkCommand, ['./app', '--help']).unknownSegment
    ).toBeUndefined();
  });

  it('resolves a hidden subcommand', () => {
    expect(
      resolveHelpTarget(aiGatewayCommand, ['coding-agents', '--help'])
    ).toMatchObject({
      command: { name: 'coding-agents' },
      unknownSegment: undefined,
    });
  });

  it('does not report the argument of a command that takes one', () => {
    expect(
      resolveHelpTarget(promoteCommand, ['dpl_123', '--help']).unknownSegment
    ).toBeUndefined();
    expect(
      resolveHelpTarget(firewallCommand, ['rules', 'add', 'extra'])
        .unknownSegment
    ).toBeUndefined();
  });

  it('returns the root command when no subcommand follows', () => {
    expect(resolvedName(firewallCommand, ['--help'])).toEqual({
      name: 'firewall',
      typedPath: [],
    });
  });

  it('walks nested subcommands', () => {
    expect(resolvedName(firewallCommand, ['rules', 'add', '--help'])).toEqual({
      name: 'add',
      typedPath: ['rules', 'add'],
    });
  });

  it('resolves subcommand aliases and keeps the typed token', () => {
    expect(resolvedName(monitorsCommand, ['create', '--help'])).toEqual({
      name: 'add',
      typedPath: ['create'],
    });
  });

  it('skips the value of a flag declared by a subcommand further down', () => {
    expect(
      resolvedName(firewallCommand, [
        '--project',
        'my-app',
        'rules',
        'add',
        '--help',
      ])
    ).toEqual({ name: 'add', typedPath: ['rules', 'add'] });
  });

  it('skips inline flag values', () => {
    expect(
      resolvedName(firewallCommand, ['--project=my-app', 'rules', 'add'])
    ).toEqual({ name: 'add', typedPath: ['rules', 'add'] });
  });

  it.each([
    'scale',
    'list',
    'instances',
  ])('treats project %s as a flag value when resolving daemon help', project => {
    expect(
      resolvedName(daemonsCommand, ['--project', project, 'list', '--help'])
    ).toEqual({ name: 'list', typedPath: ['list'] });
  });

  it('stops at the first positional argument', () => {
    expect(
      resolvedName(dnsCommand, ['ls', 'example.com', 'add', '--help'])
    ).toEqual({ name: 'list', typedPath: ['ls'] });
  });

  it('lets a group marked argumentsBeforeSubcommand take them first', () => {
    expect(
      resolvedName(vcrCommand, ['permissions', 'my-app', 'ls', '--help'])
    ).toEqual({ name: 'ls', typedPath: ['permissions', 'ls'] });
  });

  it.each([
    [promoteCommand, ['dpl_123', 'status', '--help']],
    [deployCommand, ['./my-app', 'init', '--help']],
    [apiCommand, ['/v1/projects', 'list', '--help']],
  ])('stops at the first positional for %s', (root, tokens) => {
    expect(resolvedName(root, tokens)).toEqual({
      name: root.name,
      typedPath: [],
    });
  });

  it('keeps the value of a subcommand flag that shares a global letter', () => {
    expect(
      resolvedName(flagsCommand, [
        '-d',
        'Checkout experiment',
        'create',
        'checkout',
        '--help',
      ])
    ).toEqual({ name: 'create', typedPath: ['create'] });
  });

  it('reads a global letter as the global flag when a subcommand follows', () => {
    expect(resolvedName(flagsCommand, ['-d', 'list', '--help'])).toEqual({
      name: 'list',
      typedPath: ['list'],
    });
  });

  it('skips the value of a global flag', () => {
    expect(
      resolvedName(firewallCommand, ['--scope', 'acme', 'rules', 'add'])
    ).toEqual({ name: 'add', typedPath: ['rules', 'add'] });
  });

  it('stops at the argument separator', () => {
    expect(resolvedName(firewallCommand, ['--', 'rules', 'add'])).toEqual({
      name: 'firewall',
      typedPath: [],
    });
  });

  it('falls back to the closest ancestor with documentation', () => {
    const { command, parent } = resolveHelpTarget(connexCommand, [
      'contacts',
      'add',
    ]);
    expect(command.name).toBe('add');
    expect(parent?.name).toBe(connexCommand.name);
    expect(parent?.documentation).toBeDefined();
  });
});

describe('resolveHelpTarget over the registered tree', () => {
  const nodes: { command: Command; root: Command; tokens: string[][] }[] = [];
  const visit = (
    command: Command,
    root: Command,
    tokenPaths: string[][]
  ): void => {
    nodes.push({ command, root, tokens: tokenPaths });
    for (const subcommand of command.subcommands ?? []) {
      const names = [subcommand.name, ...subcommand.aliases];
      visit(
        subcommand,
        root,
        tokenPaths.flatMap(path => names.map(name => [...path, name]))
      );
    }
  };
  for (const root of commandsStructs) {
    if ('options' in root) {
      visit(root as Command, root as Command, [[]]);
    }
  }

  it.each(
    nodes.flatMap(({ command, root, tokens }) =>
      tokens.map(path => [[root.name, ...path].join(' '), command, root, path])
    ) as [string, Command, Command, string[]][]
  )('resolves `vercel %s --help` to its own help page', (_name, command, root, path) => {
    expect(resolveHelpTarget(root, [...path, '--help']).command).toBe(command);
  });
});
