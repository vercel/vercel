import { describe, expect, test } from 'vitest';
import {
  assertAliasIntegrity,
  buildAliasResolver,
  normalizeCommandTree,
  parseCommandImportMap,
  parseRootCommandBindings,
  publicOptions,
  visibleCommands,
} from '../load-command-model.js';
import { fixtureRoot } from './fixtures.js';

describe('parseRootCommandBindings', () => {
  const source = `
import { deployCommand, aliasCommand } from './deploy/command';
import { guidanceCommand } from './guidance/command';
import { metricsCommand } from './metrics/command';
import { connexCommand } from './connex/command';

export const commandsStructs: Command[] = [
  deployCommand,
  aliasCommand,
  // retiredCommand,
  {
    name: 'help',
    aliases: [],
    description: 'Display help for a command',
    arguments: [{ name: 'command', required: false }],
    options: [],
    examples: [],
  },
];

if (process.env.FF_GUIDANCE_MODE) {
  commandsStructs.push(guidanceCommand);
}

commandsStructs.push(metricsCommand);
commandsStructs.push(connexCommand);
`;

  test('handles multi-specifier imports, comments, pushes, and feature-flag gating', () => {
    expect(parseRootCommandBindings(source)).toEqual([
      'deployCommand',
      'aliasCommand',
      'metricsCommand',
      'connexCommand',
    ]);
    expect(parseRootCommandBindings(source)).not.toContain('guidanceCommand');
    expect(parseCommandImportMap(source).get('deployCommand')).toBe(
      './deploy/command'
    );
    expect(parseCommandImportMap(source).get('aliasCommand')).toBe(
      './deploy/command'
    );
  });

  test('fails loud on bindings the import parser did not capture', () => {
    const missingImport = source.replace(
      "import { metricsCommand } from './metrics/command';\n",
      ''
    );
    expect(() => parseRootCommandBindings(missingImport)).toThrow(
      /Unrecognized command binding "metricsCommand"/
    );

    const unknownInArray = source.replace(
      'deployCommand,\n',
      'deployCommand,\n  mysteryCommand,\n'
    );
    expect(() => parseRootCommandBindings(unknownInArray)).toThrow(
      /Unrecognized command binding "mysteryCommand"/
    );
  });

  test('fails loud on renamed imports', () => {
    const renamed = source.replace(
      "import { metricsCommand } from './metrics/command';",
      "import { metricsCommand as mCommand } from './metrics/command';"
    );
    expect(() => parseCommandImportMap(renamed)).toThrow(
      /Unsupported renamed import/
    );
  });
});

describe('normalizeCommandTree', () => {
  test('walks nested commands, aliases, defaults, and hidden nodes', () => {
    const commands = normalizeCommandTree([fixtureRoot]);
    assertAliasIntegrity(commands);

    const paths = commands.map(c => c.canonicalPath);
    expect(paths).toEqual([
      'demo',
      'demo list',
      'demo add',
      'demo add rule',
      'demo secret',
    ]);

    const list = commands.find(c => c.canonicalPath === 'demo list');
    expect(list?.default).toBe(true);
    expect(list?.aliases).toEqual(['ls']);
    expect(list?.options[0]?.type).toEqual(['string']);

    const visible = visibleCommands(commands).map(c => c.canonicalPath);
    expect(visible).not.toContain('demo secret');
    expect(visible).toContain('demo list');

    const rootOpts = publicOptions(commands[0].options);
    expect(rootOpts.map(o => o.name)).toEqual(['json']);
  });

  test('buildAliasResolver resolves root and nested aliases', () => {
    const commands = normalizeCommandTree([fixtureRoot]);
    const resolve = buildAliasResolver(commands);

    expect(resolve(['d', 'ls'])).toEqual({
      path: ['demo', 'list'],
      remaining: [],
    });
    expect(resolve(['demo', 'add', 'rule'])).toEqual({
      path: ['demo', 'add', 'rule'],
      remaining: [],
    });
    expect(resolve(['demo', 'add', 'widget'])).toEqual({
      path: ['demo', 'add'],
      remaining: ['widget'],
    });
    expect(resolve(['missing'])).toBeNull();
  });

  test('detects alias collisions', () => {
    expect(() =>
      assertAliasIntegrity([
        {
          path: ['a'],
          canonicalPath: 'a',
          name: 'a',
          aliases: ['x'],
          description: '',
          hidden: false,
          default: false,
          arguments: [],
          options: [],
          disabledGlobalOptions: [],
          subcommands: [],
        },
        {
          path: ['b'],
          canonicalPath: 'b',
          name: 'b',
          aliases: ['x'],
          description: '',
          hidden: false,
          default: false,
          arguments: [],
          options: [],
          disabledGlobalOptions: [],
          subcommands: [],
        },
      ])
    ).toThrow(/Alias collision/);
  });
});
