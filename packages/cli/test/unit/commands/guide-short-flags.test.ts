import { describe, expect, it } from 'vitest';
import { client } from '../../mocks/client';
import { commandsStructs } from '../../../src/commands';
import {
  help,
  type Command,
  type CommandOption,
} from '../../../src/commands/help';
import getCommonArgs from '../../../src/util/arg-common';
import { parseArguments } from '../../../src/util/get-args';
import { getFlagsSpecification } from '../../../src/util/get-flags-specification';

// Every command that shows one of these guide letters parses it exactly like
// its long name, in every way it can be typed, and prints nothing extra.
const GUIDE_LETTERS: Readonly<Record<string, string>> = {
  project: 'p',
  limit: 'n',
  all: 'a',
  output: 'o',
};

// The sandbox CLI is external and parses its own options.
const roots = commandsStructs.filter(
  (command): command is Command =>
    'options' in command && command.name !== 'sandbox'
);

interface Node {
  path: string[];
  command: Command;
}

function collectNodes(): Node[] {
  const nodes: Node[] = [];
  const visit = (command: Command, path: string[]) => {
    const nodePath = [...path, command.name];
    nodes.push({ path: nodePath, command });
    for (const subcommand of command.subcommands ?? []) {
      visit(subcommand, nodePath);
    }
  };
  for (const root of roots) {
    visit(root, []);
  }
  return nodes;
}

const nodes = collectNodes();

interface Case {
  path: string;
  node: Node;
  option: CommandOption;
  letter: string;
}

const cases: Case[] = nodes.flatMap(node =>
  node.command.options
    .filter(option => option.shorthand === GUIDE_LETTERS[option.name])
    .map(option => ({
      path: node.path.join(' '),
      node,
      option,
      letter: `-${option.shorthand}`,
    }))
);

function valueFor(option: CommandOption, second = false): string[] {
  if (option.type === Boolean) {
    return [];
  }
  if (option.type === Number) {
    return [second ? '7' : '5'];
  }
  return [second ? 'second' : 'first'];
}

// A shown Boolean short flag to group the letter with, as in `-yp`.
function groupLetter(spec: Record<string, unknown>, letter: string) {
  for (const candidate of ['-y', '-d', '-h']) {
    let handler = spec[candidate];
    while (typeof handler === 'string') {
      handler = spec[handler];
    }
    if (candidate !== letter && handler === Boolean) {
      return candidate;
    }
  }
  throw new Error('No Boolean short flag to group with');
}

// [form, argv with the letter, the same argv with the long name]
function forms({ option, letter, node }: Case): [string, string[], string[]][] {
  const long = `--${option.name}`;
  const value = valueFor(option);
  const other = valueFor(option, true);
  const group = groupLetter(
    { ...getCommonArgs(), ...getFlagsSpecification(node.command.options) },
    letter
  );
  return [
    ['alone', [letter, ...value], [long, ...value]],
    [
      'last in a group',
      [`${group}${letter.slice(1)}`, ...value],
      [group, long, ...value],
    ],
    [
      'repeated',
      [letter, ...value, letter, ...other],
      [long, ...value, long, ...other],
    ],
    [
      'with the long name',
      [letter, ...value, long, ...other],
      [long, ...value, long, ...other],
    ],
    ['after --', ['--', letter, ...value], ['--', letter, ...value]],
  ];
}

type Outcome =
  | { args: string[]; flags: Record<string, unknown> }
  | { error: { code: unknown; message: string } };

function parse(argv: string[], options: ReadonlyArray<CommandOption>): Outcome {
  try {
    const { args, flags } = parseArguments(
      argv,
      getFlagsSpecification(options)
    );
    return { args, flags };
  } catch (err) {
    const error = err as Error & { code?: unknown };
    return { error: { code: error.code, message: error.message } };
  }
}

describe("the guide's short flags", () => {
  it('covers every command that gained one', () => {
    const counts: Record<string, number> = {};
    for (const { letter } of cases) {
      counts[letter] = (counts[letter] ?? 0) + 1;
    }
    // Guards the cases themselves: losing a shared option's letter must not
    // pass vacuously.
    expect(counts['-p']).toBeGreaterThanOrEqual(150);
    expect(counts['-n']).toBeGreaterThanOrEqual(45);
    expect(counts['-a']).toBeGreaterThanOrEqual(15);
    expect(counts['-o']).toBeGreaterThanOrEqual(4);
  });

  describe.each(cases)('$path $letter', testCase => {
    it.each(
      forms(testCase)
    )('%s parses like the long name', (_form, argv, longArgv) => {
      const { node } = testCase;
      client.setArgv(...node.path, ...argv);
      const now = parse(argv, node.command.options);
      expect(now).toEqual(parse(longArgv, node.command.options));
      expect(client.stderr.getFullOutput()).toBe('');
    });
  });
});

describe('destructive commands', () => {
  it.each([
    'integration resource disconnect',
    'integration-resource disconnect',
    'storage disconnect',
  ])('%s help shows --all without -a', path => {
    const node = nodes.find(candidate => candidate.path.join(' ') === path);
    expect(node).toBeDefined();
    const text = help(node!.command, {
      stream: { isTTY: false },
      columns: 120,
    });
    expect(text).toContain('--all');
    expect(text).not.toMatch(/-a,\s+--all/);
    expect(text).not.toMatch(/\s-a(\s|$)/m);
  });
});
