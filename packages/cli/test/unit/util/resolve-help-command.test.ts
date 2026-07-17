import { describe, expect, it } from 'vitest';
import { commandDefinitions } from '../../../src/commands';
import { parseArguments } from '../../../src/util/get-args';
import { resolveHelpCommand } from '../../../src/util/resolve-help-command';

/** Mirror the permissive parse `main()` feeds into `resolveHelpCommand`. */
function resolve(argv: string[]) {
  const parsedArgs = parseArguments(argv, {}, { permissive: true });
  return resolveHelpCommand(
    parsedArgs.args,
    parsedArgs.flags['--help'] === true,
    commandDefinitions
  );
}

describe('resolveHelpCommand', () => {
  it.each([
    [['--help'], undefined],
    [['-h'], undefined],
    [['help'], undefined],
    [['flags', '--help'], 'flags'],
    [['flags', '-h'], 'flags'],
    [['help', 'flags'], 'flags'],
    [['flags', 'rules', 'list', '--help'], 'list'],
    [['flags', '--help', 'rules', 'list'], 'list'],
    [['help', 'flags', 'rules', 'list'], 'list'],
  ])('resolves %j', (argv, expectedName) => {
    expect(resolve(argv)?.command?.name).toBe(expectedName);
  });

  it.each([
    [['--debug', '--help'], undefined],
    [['--debug', 'flags', '--help'], 'flags'],
    [['--cwd', 'some-dir', 'flags', 'rules', '--help'], 'rules'],
    [['flags', '--debug', '--help'], 'flags'],
    [['env', 'ls', '--debug', '--help'], 'list'],
    [['help', '--debug', 'flags'], 'flags'],
  ])('resolves %j with global flags in any position', (argv, expectedName) => {
    expect(resolve(argv)?.command?.name).toBe(expectedName);
  });

  it('resolves command aliases', () => {
    expect(resolve(['ls', '--help'])?.command?.name).toBe('list');
  });

  it('reports the parent of a resolved subcommand', () => {
    const resolved = resolve(['env', 'ls', '--help']);
    expect(resolved?.command?.name).toBe('list');
    expect(resolved?.parent?.name).toBe('env');
  });

  it('does not treat "h" as a help alias', () => {
    expect(resolve(['h'])).toBeNull();
    expect(resolve(['h', 'flags'])).toBeNull();
  });

  it('does not resolve child-process help', () => {
    expect(resolve(['curl', '--', '--help'])).toBeNull();
  });

  it('does not resolve when help is not requested', () => {
    expect(resolve(['deploy'])).toBeNull();
    expect(resolve(['--version'])).toBeNull();
  });

  it('leaves unknown commands to the command router', () => {
    expect(resolve(['unknown-command', '--help'])).toBeNull();
    expect(resolve(['help', 'unknown-command'])).toBeNull();
  });

  it('leaves invalid nested command structures to the command router', () => {
    expect(resolve(['flags', 'rules', 'unknown', 'list', '--help'])).toBeNull();
  });

  it('allows positional arguments after a leaf command', () => {
    expect(
      resolve(['inspect', 'my-deployment.vercel.app', '--help'])?.command?.name
    ).toBe('inspect');
  });
});
