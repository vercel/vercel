import { describe, expect, it } from 'vitest';
import { commandDefinitions } from '../../../src/commands';
import { resolveHelpCommand } from '../../../src/util/resolve-help-command';

describe('resolveHelpCommand', () => {
  it.each([
    [['--help'], undefined],
    [['-h'], undefined],
    [['help'], undefined],
    [['h'], undefined],
    [['flags', '--help'], 'flags'],
    [['flags', '-h'], 'flags'],
    [['help', 'flags'], 'flags'],
    [['h', 'flags'], 'flags'],
    [['flags', 'rules', 'list', '--help'], 'list'],
    [['flags', '--help', 'rules', 'list'], 'list'],
    [['help', 'flags', 'rules', 'list'], 'list'],
    [['h', 'flags', 'rules', 'list'], 'list'],
  ])('resolves %j', (args, expectedName) => {
    expect(resolveHelpCommand(args, commandDefinitions)?.command?.name).toBe(
      expectedName
    );
  });

  it('does not resolve child-process help', () => {
    expect(
      resolveHelpCommand(['curl', '--', '--help'], commandDefinitions)
    ).toBe(null);
  });

  it.each([
    [['--help'], 0],
    [['help'], 0],
    [['flags', '--help'], 2],
    [['help', 'flags'], 2],
  ])('preserves the help exit code for %j', (args, expectedExitCode) => {
    expect(resolveHelpCommand(args, commandDefinitions)?.exitCode).toBe(
      expectedExitCode
    );
  });

  it('leaves invalid nested command structures to the command router', () => {
    expect(
      resolveHelpCommand(
        ['flags', 'rules', 'unknown', 'list', '--help'],
        commandDefinitions
      )
    ).toBeNull();
  });

  it('allows positional arguments after a leaf command', () => {
    expect(
      resolveHelpCommand(
        ['inspect', 'my-deployment.vercel.app', '--help'],
        commandDefinitions
      )?.command?.name
    ).toBe('inspect');
  });
});
