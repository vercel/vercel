import { describe, expect, it } from 'vitest';
import { ROOT_HELP_EXAMPLES } from '../../../src/help';
import { commandsStructs } from '../../../src/commands';
import {
  resolveHelpTarget,
  type Command,
  type CommandOption,
} from '../../../src/commands/help';
import { globalCommandOptions } from '../../../src/util/arg-common';
import { getShortFlags } from '../../../src/util/get-flags-specification';

interface Node {
  command: Command;
  path: string[];
  ancestors: Command[];
}

const roots = commandsStructs.filter(
  (command): command is Command => 'options' in command
);

function collectNodes(): Node[] {
  const nodes: Node[] = [];
  const visit = (command: Command, path: string[], ancestors: Command[]) => {
    const nodePath = [...path, command.name];
    nodes.push({ command, path: nodePath, ancestors });
    for (const subcommand of command.subcommands ?? []) {
      visit(subcommand, nodePath, [...ancestors, command]);
    }
  };
  for (const root of roots) {
    visit(root, [], []);
  }
  return nodes;
}

// Splits an example command line into argv tokens, honoring quotes.
function splitArgv(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  let inToken = false;
  for (const char of line) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      inToken = true;
    } else if (/\s/.test(char)) {
      if (inToken) tokens.push(current);
      current = '';
      inToken = false;
    } else {
      current += char;
      inToken = true;
    }
  }
  if (inToken) tokens.push(current);
  return tokens;
}

function exampleCommands(command: Command): string[] {
  return command.examples
    .flatMap(example =>
      Array.isArray(example.value) ? example.value : [example.value]
    )
    .map(value => value.trim())
    .filter(value => /^vercel(\s|$)/.test(value))
    .map(value => value.split(/\s(?:\||&&|;)\s/)[0]);
}

function declaration(
  options: ReadonlyArray<CommandOption>,
  flag: string
): CommandOption | undefined {
  if (flag.startsWith('--')) {
    const name = flag.slice(2).split('=')[0];
    return options.find(
      option =>
        option.name === name ||
        (option.type === Boolean && `no-${option.name}` === name)
    );
  }
  return options.find(option =>
    getShortFlags(option).includes(flag.slice(0, 2))
  );
}

// The sandbox CLI is external, so its examples are not described by the
// local command metadata.
const EXTERNAL_COMMANDS = new Set(['sandbox']);

const cases = collectNodes()
  .filter(({ command, path, ancestors }) => {
    const hidden = [command, ...ancestors].some(node => node.hidden);
    return !hidden && !EXTERNAL_COMMANDS.has(path[0]);
  })
  .flatMap(node =>
    exampleCommands(node.command).map(line => ({ page: node.path, line }))
  )
  .concat(
    ROOT_HELP_EXAMPLES.map(({ value }) => ({ page: ['root'], line: value }))
  );

describe('help examples', () => {
  const nodes = collectNodes();

  it('has examples to check', () => {
    expect(cases.length).toBeGreaterThan(1000);
  });

  it.each(
    cases.map(({ page, line }) => [page.join(' '), line] as const)
  )('%s: %s', (_page, line) => {
    const argv = splitArgv(line).slice(1);
    const separator = argv.indexOf('--');
    const tokens = separator === -1 ? argv : argv.slice(0, separator);
    if (tokens.length === 0) {
      return;
    }

    expect(line, 'uses a legacy brand domain').not.toMatch(
      /zeit\.(rocks|party)|now\.sh/
    );

    // Examples may start with a deployment path instead of a command.
    const root = roots.find(
      command =>
        command.name === tokens[0] || command.aliases.includes(tokens[0])
    );
    if (!root) {
      expect(tokens[0], 'names an unknown command').not.toMatch(
        /^[a-z][a-z-]*$/
      );
      return;
    }
    expect(tokens[0], 'uses the canonical command name').toBe(root.name);

    const { command, typedPath } = resolveHelpTarget(root, tokens.slice(1));
    const node = nodes.find(candidate => candidate.command === command)!;
    expect(typedPath, 'uses canonical subcommand names').toEqual(
      node.path.slice(1, typedPath.length + 1)
    );

    // Flags after a group name may belong to its default subcommand, as in
    // `vercel comments --json`.
    const defaultSubcommand = command.subcommands?.find(
      subcommand => subcommand.default
    );
    const options = [
      ...globalCommandOptions,
      ...node.ancestors.flatMap(ancestor => ancestor.options),
      ...command.options,
      ...(defaultSubcommand?.options ?? []),
    ];
    const flags = tokens
      .slice(1)
      .filter(token => /^-{1,2}[A-Za-z]/.test(token));
    const undeclared = flags.filter(token => !declaration(options, token));
    expect(undeclared, 'uses flags the command does not declare').toEqual([]);
    // A deprecated option is a hidden old name; examples teach its replacement.
    const deprecated = flags.filter(
      token => declaration(options, token)?.deprecated
    );
    expect(deprecated, 'uses deprecated flags').toEqual([]);
    // A hidden short form is an old spelling; examples teach the long name.
    const hiddenShortForms = flags.filter(token => {
      const option = declaration(options, token);
      return (
        option?.deprecatedShorthand !== undefined &&
        token.slice(0, 2) === `-${option.deprecatedShorthand}`
      );
    });
    expect(hiddenShortForms, 'uses hidden short flags').toEqual([]);
  });
});
