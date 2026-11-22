import { describe, expect, it } from 'vitest';
import { client } from '../../mocks/client';
import { commandsStructs } from '../../../src/commands';
import {
  resolveHelpTarget,
  type Command,
  type CommandOption,
} from '../../../src/commands/help';
import getCommonArgs from '../../../src/util/arg-common';
import { parseArguments } from '../../../src/util/get-args';
import { getFlagsSpecification } from '../../../src/util/get-flags-specification';

// Every hidden short flag, in every way it can be typed, must parse exactly
// as it did when help still showed it. The only new output is one
// deprecation warning on stderr.

// The sandbox CLI is external and parses its own options.
const roots = commandsStructs.filter(
  (command): command is Command =>
    'options' in command && command.name !== 'sandbox'
);

// The metadata as it was: each hidden letter back as the shown short flag.
// An option that has since gained the guide's letter, like `-n` next to the
// hidden `-l` of `--limit`, had only the old one.
function withShownShorthands(command: Command): Command {
  return {
    ...command,
    options: command.options.map(option => {
      if (option.deprecatedShorthand === undefined) {
        return option;
      }
      const { deprecatedShorthand, ...rest } = option;
      return { ...rest, shorthand: deprecatedShorthand };
    }),
    subcommands: command.subcommands?.map(withShownShorthands),
  };
}

interface Node {
  path: string[];
  root: Command;
  command: Command;
  before: Command;
}

function collectNodes(): Node[] {
  const nodes: Node[] = [];
  const visit = (
    root: Command,
    command: Command,
    before: Command,
    path: string[]
  ) => {
    const nodePath = [...path, command.name];
    nodes.push({ path: nodePath, root, command, before });
    (command.subcommands ?? []).forEach((subcommand, index) => {
      visit(root, subcommand, before.subcommands![index], nodePath);
    });
  };
  for (const root of roots) {
    visit(root, root, withShownShorthands(root), []);
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
    .filter(option => option.deprecatedShorthand !== undefined)
    .map(option => ({
      path: node.path.join(' '),
      node,
      option,
      letter: `-${option.deprecatedShorthand}`,
    }))
);

// Every hidden short flag, and the option it still means. Each one was a shown
// short flag before; none may be added. Removing them is a major version.
const HIDDEN_SHORT_FLAGS: Readonly<Record<string, readonly string[]>> = {
  'ai-gateway leaderboard apps': ['-F --format'],
  'ai-gateway leaderboard labs': ['-F --format'],
  'ai-gateway leaderboard models': ['-F --format'],
  'ai-gateway leaderboard providers': ['-F --format'],
  bisect: ['-b --bad', '-g --good', '-o --open', '-p --path', '-r --run'],
  'blob copy': [
    '-a --access',
    '-c --cache-control-max-age',
    '-r --add-random-suffix',
    '-t --content-type',
  ],
  'blob create-store': ['-a --access', '-r --region'],
  'blob get': ['-a --access'],
  'blob list': ['-l --limit', '-m --mode', '-p --prefix'],
  'blob presign': ['-a --access', '-o --operation'],
  'blob put': [
    '-a --access',
    '-c --cache-control-max-age',
    '-p --pathname',
    '-r --add-random-suffix',
    '-t --content-type',
    '-u --multipart',
  ],
  'blob put-image': [
    '-F --format',
    '-a --access',
    '-c --cache-control-max-age',
    '-p --pathname',
    '-q --quality',
    '-r --add-random-suffix',
    '-w --width',
  ],
  'blob signed-token': ['-o --operation', '-p --pathname'],
  'comments reply': ['-m --message'],
  'comments resolve': ['-m --message'],
  'comments update': ['-m --message'],
  'connect create': ['-n --name'],
  'connect delete': ['-a --disconnect-all'],
  'connect token': ['-s --subject'],
  deploy: ['-f --force', '-l --logs', '-m --meta'],
  'deploy init': ['-f --force', '-m --meta'],
  dev: ['-L --local', '-l --listen'],
  'experiments diagnose': ['-e --event', '-l --limit'],
  feedback: ['-f --field'],
  'firewall rules list': ['-e --expand'],
  'flags create': ['-d --description', '-k --kind', '-v --variant'],
  'flags disable': ['-v --variant'],
  'flags entities create': ['-a --attribute', '-l --label'],
  'flags entities update': ['-l --label'],
  'flags evaluations': ['-g --granularity'],
  'flags list': ['-s --state'],
  'flags rollout': ['-s --stage'],
  'flags rules add': [
    '-c --condition',
    '-p --position',
    '-s --stage',
    '-v --variant',
    '-w --weight',
  ],
  'flags rules move': ['-p --position'],
  'flags rules update': [
    '-c --condition',
    '-s --stage',
    '-v --variant',
    '-w --weight',
  ],
  'flags sdk-keys create': ['-l --label'],
  'flags segments create': ['-a --add', '-d --description', '-l --label'],
  'flags segments update': ['-a --add', '-d --description', '-l --label'],
  'flags set': ['-v --variant'],
  'flags split': ['-w --weight'],
  'flags targets add': ['-v --variant'],
  'flags update': ['-l --label', '-v --variant'],
  'global-config items': ['-k --key'],
  init: ['-f --force'],
  inspect: ['-l --logs'],
  install: ['-n --name'],
  'integration add': ['-n --name'],
  'integration discover': ['-c --category'],
  'integration guide': ['-f --framework'],
  'integration installations': ['-i --integration'],
  'integration list': ['-i --integration'],
  'integration resource delete': ['-a --disconnect-all'],
  'integration resource disconnect': ['-a --all'],
  'integration-resource delete': ['-a --disconnect-all'],
  'integration-resource disconnect': ['-a --all'],
  'kms create': ['-a --algorithm'],
  'kms import': ['-a --algorithm', '-k --key'],
  'kms import-key': ['-k --key'],
  link: ['-r --repo'],
  list: ['-m --meta', '-p --policy', '-s --status'],
  metrics: ['-a --aggregation', '-g --granularity', '-l --limit'],
  remove: ['-s --safe'],
  'routes list': ['-e --expand'],
  schedules: ['-L --local'],
  'schedules create': ['-L --local'],
  'schedules delete': ['-L --local'],
  'schedules disable': ['-L --local'],
  'schedules enable': ['-L --local'],
  'schedules executions': ['-L --local'],
  'schedules executions list': ['-L --local'],
  'schedules inspect': ['-L --local'],
  'schedules invoke': ['-L --local'],
  'schedules list': ['-L --local'],
  'schedules update': ['-L --local'],
  'storage disconnect': ['-a --all'],
  'webhooks create': ['-e --event'],
};

// Hidden short flags of renamed options. Each stays the short form of its
// hidden old name, as `deploy-hooks create -r` stays on `--ref`, so it parses
// exactly as before, mixed with the old long name too. The command's warning
// names the new option.
const RENAMED_OPTION_SHORT_FLAGS: Readonly<Record<string, readonly string[]>> =
  {
    install: ['-m --metadata', '-p --plan'],
    'integration add': ['-m --metadata', '-p --plan'],
    'integration update': ['-p --plan'],
    metrics: ['-f --filter'],
    'project list': ['-f --filter'],
    'redirects list': ['-s --search'],
    'routes list': ['-f --filter', '-s --search'],
  };

function valueFor(option: CommandOption, second = false): string[] {
  if (option.type === Boolean) {
    return [];
  }
  if (option.type === Number) {
    return [second ? '7' : '5'];
  }
  return [second ? 'second' : 'first'];
}

// A shown Boolean short flag to group the hidden letter with, as in `-yd`.
function groupLetter(spec: Record<string, unknown>, letter: string) {
  for (const candidate of ['-y', '-d', '-h']) {
    let handler = spec[candidate];
    while (typeof handler === 'string') {
      handler = spec[handler];
    }
    if (candidate !== letter && handler === Boolean) {
      return candidate.slice(1);
    }
  }
  throw new Error('No Boolean short flag to group with');
}

function forms({ option, letter, node }: Case): [string, string[], boolean][] {
  const long = `--${option.name}`;
  const value = valueFor(option);
  const other = valueFor(option, true);
  const spec = {
    ...getCommonArgs(),
    ...getFlagsSpecification(node.command.options),
  };
  const group = groupLetter(spec, letter);
  const result: [string, string[], boolean][] = [
    // [form, argv, whether the hidden letter is used before `--`]
    ['alone', [letter, ...value], true],
    ['with =', [`${letter}=${value[0] ?? 'true'}`], true],
    ['last in a group', [`-${group}${letter.slice(1)}`, ...value], true],
    ['repeated', [letter, ...value, letter, ...other], true],
    ['before the long name', [letter, ...value, long, ...other], true],
    ['after the long name', [long, ...value, letter, ...other], true],
    ['after --', ['--', letter, ...value], false],
  ];
  if (option.type === Boolean) {
    result.push(['first in a group', [`${letter}${group}`], true]);
  }
  return result;
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

describe('hidden short flags', () => {
  it('hides exactly the short flags that help used to show', () => {
    const hidden: Record<string, string[]> = {};
    for (const { path, letter, option } of cases) {
      (hidden[path] ??= []).push(`${letter} --${option.name}`);
      hidden[path].sort();
    }
    expect(hidden).toEqual(HIDDEN_SHORT_FLAGS);
  });

  it.each(
    Object.entries(RENAMED_OPTION_SHORT_FLAGS).flatMap(([path, flags]) =>
      flags.map(flag => [path, ...flag.split(' ')] as const)
    )
  )('keeps %s %s on its hidden old name %s', (path, letter, long) => {
    const node = nodes.find(candidate => candidate.path.join(' ') === path);
    const option = node?.command.options.find(
      candidate => `--${candidate.name}` === long
    );
    expect(option?.deprecated, `${path} ${long} is hidden`).toBe(true);
    expect(option?.shorthand).toBe(letter.slice(1));
    const spec: Record<string, unknown> = getFlagsSpecification(
      node!.command.options
    );
    expect(spec[letter]).toBe(long);
  });

  it('gives every command the same parser as before', () => {
    for (const { path, command, before } of nodes) {
      // The guide's letters added next to a hidden one, like `-n` for
      // `--limit`, are the only new keys.
      const added = new Set(
        command.options
          .filter(option => option.shorthand && option.deprecatedShorthand)
          .map(option => `-${option.shorthand}`)
      );
      expect(
        Object.entries(getFlagsSpecification(command.options)).filter(
          ([key]) => !added.has(key)
        ),
        path.join(' ')
      ).toEqual(Object.entries(getFlagsSpecification(before.options)));
    }
  });

  describe.each(cases)('$path $letter', testCase => {
    const { option, letter, node } = testCase;

    it.each(forms(testCase))('%s parses as before', (_form, argv, used) => {
      client.setArgv(...node.path, ...argv);
      const now = parse(argv, node.command.options);
      const warnings = client.stderr.getFullOutput();
      const before = parse(argv, node.before.options);

      expect(now).toEqual(before);
      expect(warnings).toBe(
        used && 'flags' in now
          ? `! ${letter} is deprecated. Use --${option.name}.\n`
          : ''
      );
    });

    if (node.command.options.some(({ name }) => name === 'json')) {
      it('prints nothing extra with --json', () => {
        const argv = [letter, ...valueFor(option), '--json'];
        client.setArgv(...node.path, ...argv);
        const now = parse(argv, node.command.options);
        expect(client.stderr.getFullOutput()).toBe('');
        expect(now).toEqual(parse(argv, node.before.options));
      });
    }

    it('reaches the same help when it comes before the subcommand', () => {
      const flag = [letter, ...valueFor(option)];
      const tokens =
        node.path.length === 1
          ? flag
          : [...node.path.slice(1, -1), ...flag, ...node.path.slice(-1)];
      const now = resolveHelpTarget(node.root, tokens);
      const before = resolveHelpTarget(withShownShorthands(node.root), tokens);
      expect(now.typedPath).toEqual(before.typedPath);
      expect(now.unknownSegment).toEqual(before.unknownSegment);
    });
  });
});
