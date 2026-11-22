import { describe, expect, it } from 'vitest';
import { client } from '../../mocks/client';
import { commandsStructs } from '../../../src/commands';
import type { Command } from '../../../src/commands/help';
import { entryPoint } from '../../helpers/command-entry-points';

// The sandbox CLI is external and parses its own options.
const EXTERNAL_COMMANDS = new Set(['sandbox']);

/**
 * Commands that don't exit 2 with nothing on stdout for an unknown option.
 * This list may only shrink: fixing a command removes its entry.
 */
const UNKNOWN_OPTION_EXCEPTIONS: Readonly<Record<string, string>> = {
  'blob copy': 'Looks up Blob credentials before reading its options',
  'blob delete': 'Looks up Blob credentials before reading its options',
  'blob empty-store': 'Looks up Blob credentials before reading its options',
  'blob get': 'Looks up Blob credentials before reading its options',
  'blob list': 'Looks up Blob credentials before reading its options',
  'blob presign': 'Looks up Blob credentials before reading its options',
  'blob put': 'Looks up Blob credentials before reading its options',
  'blob put-image': 'Looks up Blob credentials before reading its options',
  'blob signed-token': 'Looks up Blob credentials before reading its options',
  'flags entities create': 'Exits 1 when its options do not parse',
  'flags entities delete': 'Exits 1 when its options do not parse',
  'flags entities list': 'Exits 1 when its options do not parse',
  'flags entities update': 'Exits 1 when its options do not parse',
  'link add': 'Looks for a repository link before reading its options',
  pricing: 'Exits 1 when its options do not parse',
};

const roots = commandsStructs.filter(
  (command): command is Command =>
    'options' in command && !EXTERNAL_COMMANDS.has(command.name)
);

interface Case {
  path: string;
  argv: string[];
}

// Every command that does work, reached through its canonical path: commands
// without subcommands, and groups that do work when run without one.
function collectCases(): Case[] {
  const cases: Case[] = [];
  const visit = (command: Command, path: string[], argv: string[]) => {
    const nodePath = [...path, command.name];
    const nodeArgv = [...argv, command.name];
    const subcommands = command.subcommands ?? [];
    const runsWithoutSubcommand =
      command.arguments.length > 0 ||
      command.runsWithoutSubcommand === true ||
      subcommands.some(subcommand => subcommand.default);
    if (subcommands.length === 0 || runsWithoutSubcommand) {
      cases.push({ path: nodePath.join(' '), argv: nodeArgv });
    }

    // A group like `vcr permissions <repository> ls` takes its arguments
    // before the subcommand, so fill them in to reach the subcommand.
    const subcommandArgv = command.argumentsBeforeSubcommand
      ? [
          ...nodeArgv,
          ...command.arguments.map(argument => `example-${argument.name}`),
        ]
      : nodeArgv;
    for (const subcommand of subcommands) {
      visit(subcommand, nodePath, subcommandArgv);
    }
  };
  for (const root of roots) {
    visit(root, [], []);
  }
  return cases;
}

// Runs the command the way `src/index.ts` does, and returns its exit code.
async function run(argv: string[]): Promise<number | undefined> {
  client.setArgv(...argv, '--not-an-option');
  try {
    return await entryPoint(argv[0])!(client);
  } catch (err) {
    // The entry point turns an unknown option that a command lets through
    // into exit code 2.
    if (
      err instanceof Error &&
      'code' in err &&
      err.code === 'ARG_UNKNOWN_OPTION'
    ) {
      return 2;
    }
    throw err;
  }
}

describe('unknown options', () => {
  const cases = collectCases();

  it('runs every registered command', () => {
    const missing = roots
      .map(root => root.name)
      .filter(name => !entryPoint(name));
    expect(missing).toEqual([]);
  });

  it('lists only commands that exist', () => {
    const paths = new Set(cases.map(({ path }) => path));
    for (const path of Object.keys(UNKNOWN_OPTION_EXCEPTIONS)) {
      expect(paths.has(path), path).toBe(true);
    }
  });

  it.each(
    cases.map(({ path, argv }) => [path, argv] as const)
  )('vercel %s --not-an-option exits 2', async (name, argv) => {
    const exitCode = await run(argv);
    const stdout = client.stdout.getFullOutput();
    const passes = exitCode === 2 && stdout === '';

    if (name in UNKNOWN_OPTION_EXCEPTIONS) {
      expect(
        passes,
        `${name} now exits 2, so remove it from UNKNOWN_OPTION_EXCEPTIONS`
      ).toBe(false);
    } else {
      expect({ exitCode, stdout }).toEqual({ exitCode: 2, stdout: '' });
    }
  });
});
