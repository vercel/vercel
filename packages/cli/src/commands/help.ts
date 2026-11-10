import { remoteText } from '../util/output/remote-text';
import { NAME } from '@vercel-internals/constants';
import {
  helpColumns,
  helpCommandNames,
  helpCommand,
  helpHeading,
  helpInlineCommand,
  helpUsage,
  helpRows,
  helpLiterals,
  helpPlaceholders,
  type HelpRow,
  helpSection,
  wrapHelpText,
} from '../util/output/help-format';
import { createHelpTheme, type HelpTheme } from '../util/output/help-theme';
import { globalCommandOptions } from '../util/arg-common';
import { getShortFlags } from '../util/get-flags-specification';

const NEWLINE = '\n';

export type PrimitiveConstructor =
  | typeof String
  | typeof Boolean
  | typeof Number;

export interface CommandOption {
  readonly name: string;
  readonly shorthand: string | null;
  /**
   * An old short form, such as `d` for `--description`. It still parses but
   * is hidden from help, and `parseArguments` warns when it's used.
   */
  readonly deprecatedShorthand?: string;
  readonly type: PrimitiveConstructor | ReadonlyArray<PrimitiveConstructor>;
  readonly argument?: string;
  readonly deprecated: boolean;
  readonly description?: string;
  /**
   * An on/off option that used to take a value, such as `--public true`. The
   * old values still work and warn (see `rewriteLegacyOnOffValues`).
   */
  readonly legacyValues?: { readonly on: string; readonly off: string };
  /**
   * The command rejects `--x=value` itself, so the entry point's warning for
   * `--x=false` skips this option (see `getFalseValueWarnings`).
   */
  readonly rejectsValue?: true;
}
export interface CommandArgument {
  readonly name: string;
  readonly required: boolean;
  readonly multiple?: true;
  readonly description?: string;
}
export interface CommandExample {
  readonly name: string;
  readonly value: string | ReadonlyArray<string>;
  /** Exact template spans requiring substitution; never inferred from shell text. */
  readonly placeholders?: ReadonlyArray<string>;
}
export interface HelpSection {
  readonly title: string;
  readonly rows?: ReadonlyArray<HelpRow>;
  readonly body: ReadonlyArray<
    | string
    | {
        readonly command: string;
        readonly placeholders?: ReadonlyArray<string>;
      }
  >;
  /** Shell commands and structured input retain their syntax and indentation. */
  readonly preformatted?: true;
  /**
   * Where the section renders. By default sections follow the examples;
   * `afterOptions` places it between the command options and global options.
   */
  readonly placement?: 'afterOptions';
}
export interface Command {
  readonly name: string;
  readonly aliases: ReadonlyArray<string>;
  readonly description: string;
  /** Keep essential consequences or prerequisites out of faint intro styling. */
  readonly descriptionTone?: 'normal';
  /** Concise navigation summary for root and parent command lists. */
  readonly summary?: string;
  readonly default?: true;
  readonly hidden?: true;
  readonly arguments: ReadonlyArray<CommandArgument>;
  readonly subcommands?: ReadonlyArray<Command>;
  readonly options: ReadonlyArray<CommandOption>;
  readonly examples: ReadonlyArray<CommandExample>;
  readonly helpSections?: ReadonlyArray<HelpSection>;
  /** Title of the subcommand list. Defaults to "Commands". */
  readonly subcommandsTitle?: string;
  readonly disabledGlobalOptions?: ReadonlyArray<string>;
  /**
   * Help depends on runtime data, such as an integration's products, so the
   * command answers `--help` itself instead of the CLI printing static help.
   */
  readonly dynamicHelp?: true;
  /**
   * The group takes its arguments before its subcommand, as in
   * `vercel vcr permissions <repository> ls`.
   */
  readonly argumentsBeforeSubcommand?: true;
  /**
   * The command does work when run without a subcommand, as `vercel link`
   * does, instead of showing its help like other groups.
   */
  readonly runsWithoutSubcommand?: true;
  /**
   * Options the command doesn't define go to another program, as `vercel
   * curl` passes `-v` to curl, so `--version` and `-v` don't print the CLI
   * version.
   */
  readonly forwardsUnknownOptions?: true;
  readonly documentation?: {
    readonly label: string;
    readonly url: string;
  };
}

// Insert spaces in between non-whitespace items only
export function lineToString(line: string[]) {
  let string = '';
  for (let i = 0; i < line.length; i++) {
    if (i === line.length - 1) {
      string += line[i];
    } else {
      const curr = line[i];
      const next = line[i + 1];
      string += curr;
      if (curr.trim() !== '' && next.trim() !== '') {
        string += ' ';
      }
    }
  }
  return string;
}

export function outputArrayToString(outputArray: (string | null)[]) {
  return outputArray.filter(line => line !== null).join(NEWLINE);
}

type CommandTreeNode = Pick<Command, 'name' | 'subcommands'> &
  Partial<Pick<Command, 'arguments' | 'argumentsBeforeSubcommand'>>;

// Full invocation path of every registered command, e.g.
// `['firewall', 'rules', 'add']`, so help renders the complete command no
// matter which parent a caller passes.
const commandPaths = new WeakMap<CommandTreeNode, ReadonlyArray<string>>();
const commandAncestors = new WeakMap<
  CommandTreeNode,
  ReadonlyArray<CommandTreeNode>
>();

/**
 * Records the invocation path of every command in the registered tree.
 * A subcommand object shared by two trees keeps the path it was first
 * registered under.
 */
export function registerCommandPaths(roots: ReadonlyArray<CommandTreeNode>) {
  const visit = (
    command: CommandTreeNode,
    ancestors: ReadonlyArray<CommandTreeNode>
  ) => {
    const path = [...ancestors.map(ancestor => ancestor.name), command.name];
    if (!commandPaths.has(command)) {
      commandPaths.set(command, path);
      commandAncestors.set(command, ancestors);
    }
    for (const subcommand of command.subcommands ?? []) {
      visit(subcommand, [...ancestors, command]);
    }
  };
  for (const root of roots) {
    visit(root, []);
  }
}

/**
 * Returns the registered invocation path of `command`, falling back to
 * `parent` + `command` for commands outside the registered tree.
 */
export function getCommandPath(
  command: Command,
  parent?: Command
): ReadonlyArray<string> {
  const registered = commandPaths.get(command);
  if (registered) {
    return registered;
  }
  return parent ? [parent.name, command.name] : [command.name];
}

/**
 * Example: `▲ vercel deploy [path] [options]`
 * @param command
 * @returns
 */
function argumentSynopsis(argument: CommandArgument): string {
  const value = argument.required ? `<${argument.name}>` : `[${argument.name}]`;
  return `${value}${argument.multiple ? '...' : ''}`;
}

export function buildCommandSynopsisLine(
  command: Command,
  parent?: Command,
  theme = createHelpTheme()
) {
  const line: string[] = [helpUsage(theme), theme.reference(NAME)];
  const ancestors = commandAncestors.get(command) ?? (parent ? [parent] : []);
  for (const [index, name] of getCommandPath(command, parent).entries()) {
    line.push(theme.reference(remoteText(name)));
    const ancestor = ancestors[index];
    if (ancestor?.argumentsBeforeSubcommand) {
      for (const argument of ancestor.arguments ?? [])
        line.push(argumentSynopsis(argument));
    }
  }
  const args = command.arguments.slice(0);
  if (
    command.subcommands?.some(subcommand => !subcommand.hidden) &&
    (args.length === 0 || command.argumentsBeforeSubcommand)
  ) {
    args.push({
      name: 'command',
      required:
        !command.runsWithoutSubcommand &&
        !command.subcommands.some(subcommand => subcommand.default),
    });
  }

  if (args.length > 0) {
    for (const argument of args) {
      line.push(argumentSynopsis(argument));
    }
  }
  if (
    command.options.some(
      option => !option.deprecated && option.description !== undefined
    )
  ) {
    line.push('[options]');
  }

  return lineToString(line);
}

export function buildCommandOptionLines(
  commandOptions: ReadonlyArray<CommandOption>,
  options: HelpLayoutOptions,
  sectionTitle: string
) {
  // Filter out deprecated and intentionally undocumented options
  const filteredCommandOptions = commandOptions.filter(
    option => !option.deprecated && option.description !== undefined
  );

  if (filteredCommandOptions.length === 0) {
    return null;
  }

  // Sort command options alphabetically
  filteredCommandOptions.sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );

  return helpSection(
    sectionTitle,
    helpRows(
      filteredCommandOptions.map(option => ({
        syntax: [
          ...(option.shorthand
            ? [
                { text: `-${option.shorthand}`, literal: true as const },
                { text: ', ' },
              ]
            : []),
          { text: `--${option.name}`, literal: true as const },
          { text: option.argument ? ` <${option.argument}>` : '' },
        ],
        description: option.description ?? '',
      })),
      options.columns,
      options.theme
    ),
    options.theme
  );
}

export function buildSubcommandLines(
  subcommands: ReadonlyArray<Command> | undefined,
  options: HelpLayoutOptions,
  title = 'Commands'
) {
  const visible = subcommands?.filter(command => !command.hidden);
  if (!visible?.length) return null;
  return helpSection(
    title,
    helpRows(
      visible.map(command => ({
        syntax: [
          ...helpLiterals(helpCommandNames(command)),
          ...command.arguments.map(argument => ({
            text: ` ${argumentSynopsis(argument)}`,
          })),
        ],
        description: `${command.summary ?? command.description}${command.default ? ' (default)' : ''}`,
      })),
      options.columns,
      options.theme
    ),
    options.theme
  );
}

export function buildCommandExampleLines(
  command: Pick<Command, 'examples'>,
  columns = 80,
  theme = createHelpTheme()
) {
  if (!command.examples?.length) return null;
  return helpSection(
    'Examples',
    command.examples
      .map(example => {
        const values = Array.isArray(example.value)
          ? example.value
          : [example.value];
        const placeholders = helpPlaceholders(values, example.placeholders);
        return [
          wrapHelpText(example.name, columns),
          ...values.map(value => helpCommand(value, placeholders, theme)),
        ].join(NEWLINE);
      })
      .join('\n\n'),
    theme
  );
}

export function buildCommandDocumentationLines(
  command: Command,
  options: HelpLayoutOptions & Pick<HelpOptions, 'parent' | 'omitDocumentation'>
) {
  if (options.omitDocumentation) return null;
  const documentation = command.documentation ?? options.parent?.documentation;
  if (!documentation) return null;
  const theme = options.theme;
  return helpSection(
    documentation.label,
    `  ${theme.link(remoteText(documentation.url))}`,
    theme
  );
}

interface HelpLayoutOptions {
  columns: number;
  theme: HelpTheme;
}

type BuildHelpOutputOptions = Omit<HelpOptions, 'columns'> & {
  columns: number;
};

export function buildHelpOutput(
  command: Command,
  input: BuildHelpOutputOptions
) {
  const options = {
    ...input,
    theme: input.theme ?? createHelpTheme(input.stream),
  };
  const globalOptions = globalCommandOptions.filter(
    opt =>
      'description' in opt && !command.disabledGlobalOptions?.includes(opt.name)
  );
  const sections = command.helpSections ?? [];
  const buildSection = (section: HelpSection) =>
    helpSection(
      section.title,
      [
        helpRows(section.rows ?? [], options.columns, options.theme),
        section.body
          .map(line => {
            if (typeof line !== 'string') {
              const placeholders = helpPlaceholders(
                [line.command],
                line.placeholders
              );
              const hint = placeholders.length
                ? `${wrapHelpText(`Replace ${placeholders.join(', ')} before running:`, options.columns)}\n`
                : '';
              return (
                hint + helpCommand(line.command, placeholders, options.theme)
              );
            }
            if (line === '') return '';
            return section.preformatted
              ? `  ${remoteText(line)}`
              : wrapHelpText(line, options.columns);
          })
          .join(NEWLINE),
      ]
        .filter(Boolean)
        .join(NEWLINE),
      options.theme
    );
  const globalPointer = `See ${helpInlineCommand('vercel --help')}${command.disabledGlobalOptions?.length ? ` (except ${command.disabledGlobalOptions.map(name => `--${name}`).join(', ')})` : ''}`;
  const globalHelp =
    `Global Options: ${globalPointer}`.length <= options.columns
      ? `${helpHeading('Global Options', options.theme)} ${globalPointer}`
      : helpSection(
          'Global Options',
          wrapHelpText(globalPointer, options.columns),
          options.theme
        );
  const header = [
    buildCommandSynopsisLine(command, options.parent, options.theme),
    command.descriptionTone === 'normal'
      ? wrapHelpText(command.description.trim(), options.columns, '')
      : options.theme.description(
          wrapHelpText(command.description.trim(), options.columns, '')
        ),
  ]
    .filter(Boolean)
    .join(NEWLINE);
  return (
    [
      header,
      buildSubcommandLines(
        command.subcommands,
        options,
        command.subcommandsTitle
      ),
      command.arguments.some(argument => argument.description)
        ? helpSection(
            'Arguments',
            helpRows(
              command.arguments.map(argument => ({
                syntax: argumentSynopsis(argument),
                description: argument.description ?? '',
              })),
              options.columns,
              options.theme
            ),
            options.theme
          )
        : null,
      buildCommandOptionLines(command.options, options, 'Options'),
      ...sections
        .filter(section => section.placement === 'afterOptions')
        .map(buildSection),
      globalOptions.length ? globalHelp : null,
      buildCommandExampleLines(command, options.columns, options.theme),
      ...sections
        .filter(section => section.placement !== 'afterOptions')
        .map(buildSection),
      buildCommandDocumentationLines(command, options),
    ]
      .filter(Boolean)
      .join('\n\n') + NEWLINE
  );
}

export interface HelpOptions {
  columns?: number;
  parent?: Command;
  omitDocumentation?: true;
  stream: { isTTY?: boolean };
  theme?: HelpTheme;
}

export function help(command: Command, options: HelpOptions) {
  return buildHelpOutput(command, {
    ...options,
    columns: helpColumns(options.columns),
    theme: options.theme ?? createHelpTheme(options.stream),
  });
}

function findOption(
  token: string,
  options: ReadonlyArray<CommandOption>
): CommandOption | undefined {
  if (token.startsWith('--')) {
    return options.find(candidate => candidate.name === token.slice(2));
  }
  return options.find(candidate => getShortFlags(candidate).includes(token));
}

function subtreeOptions(command: Command): CommandOption[] {
  return [
    ...command.options,
    ...(command.subcommands ?? []).flatMap(subtreeOptions),
  ];
}

// Flags may appear before the subcommand that declares them, as in
// `vercel firewall --project my-app rules add`, so fall back to the options
// declared anywhere below the current command.
function isSubcommandOf(command: Command, token: string | undefined) {
  return (
    token !== undefined &&
    (command.subcommands ?? []).some(
      subcommand =>
        subcommand.name === token || subcommand.aliases.includes(token)
    )
  );
}

function optionTakesValue(
  token: string,
  walkedOptions: ReadonlyArray<CommandOption>,
  command: Command,
  nextToken: string | undefined
): boolean {
  const walked = findOption(token, walkedOptions);
  if (walked) {
    return walked.type !== Boolean;
  }
  // A value-taking flag declared further down wins over a global flag with
  // the same letter, as in `vercel flags -d "Checkout" create`, unless its
  // value would be a subcommand, as in `vercel flags -d list`.
  const below = findOption(token, subtreeOptions(command));
  const global = findOption(token, globalCommandOptions);
  if (
    below &&
    below.type !== Boolean &&
    (!global || global.type !== Boolean || !isSubcommandOf(command, nextToken))
  ) {
    return true;
  }
  return global !== undefined && global.type !== Boolean;
}

export interface HelpTarget {
  command: Command;
  /** Closest ancestor that carries documentation, used as the help fallback. */
  parent?: Command;
  /** The subcommand tokens as typed, for telemetry. */
  typedPath: ReadonlyArray<string>;
  /**
   * A token that names no subcommand of a group that takes no arguments, has
   * no default subcommand, and does no work of its own, as `nope` in
   * `vercel env nope --help`.
   */
  unknownSegment?: string;
}

/**
 * Resolves which command a `--help` invocation asks about by walking the
 * subcommand tokens that follow `root`. Flag values are skipped using the
 * options of the commands walked so far, and the walk stops at the first
 * token that is not a subcommand, since that is a positional argument.
 */
export function resolveHelpTarget(
  root: Command,
  tokens: ReadonlyArray<string>
): HelpTarget {
  let command = root;
  const ancestors: Command[] = [];
  const typedPath: string[] = [];
  const options: CommandOption[] = [...root.options];
  let groupArguments = 0;
  let unknownSegment: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--') {
      break;
    }
    if (token.startsWith('-')) {
      if (
        !token.includes('=') &&
        optionTakesValue(token, options, command, tokens[i + 1])
      ) {
        i++;
      }
      continue;
    }
    const subcommand = command.subcommands?.find(
      candidate => candidate.name === token || candidate.aliases.includes(token)
    );
    if (!subcommand) {
      if (
        command.argumentsBeforeSubcommand &&
        groupArguments < command.arguments.length
      ) {
        groupArguments++;
        continue;
      }
      if (
        command.subcommands?.length &&
        command.arguments.length === 0 &&
        !command.runsWithoutSubcommand &&
        !command.subcommands.some(candidate => candidate.default)
      ) {
        unknownSegment = token;
      }
      break;
    }
    ancestors.push(command);
    typedPath.push(token);
    options.push(...subcommand.options);
    command = subcommand;
    groupArguments = 0;
  }

  let parent = ancestors[ancestors.length - 1];
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (ancestors[i].documentation) {
      parent = ancestors[i];
      break;
    }
  }
  return { command, parent, typedPath, unknownSegment };
}
