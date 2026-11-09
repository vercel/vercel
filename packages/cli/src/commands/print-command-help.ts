import type Client from '../util/client';
import output from '../output-manager';
import { globalCliFlagTakesValue } from '../util/arg-common';
import {
  shouldEmitNonInteractiveCommandError,
  writeAgentError,
} from '../util/agent-output';
import { AGENT_STATUS } from '../util/agent-output-constants';
import { printError } from '../util/error';
import { parseArguments, takeCommand } from '../util/get-args';
import { getFlagsSpecification } from '../util/get-flags-specification';
import { getCommandNamePlain } from '../util/pkg-name';
import { helpCommand as formatHelpCommand } from '../util/output/help-format';
import { createHelpTheme } from '../util/output/help-theme';
import { RootTelemetryClient } from '../util/telemetry/root';
import { commands, commandsStructs } from '.';
import {
  help,
  resolveHelpTarget,
  type Command,
  type CommandOption,
} from './help';

/**
 * Answers `--help` for a built-in command: prints the help page of the
 * command `tokens` resolve to, on stdout, records the `flag:help` event, and
 * returns exit code 0. A path through a group that names no subcommand is a
 * usage error instead, and returns exit code 2.
 *
 * Returns `undefined` without printing when the command renders its own help:
 * extensions, the external sandbox CLI, and commands with `dynamicHelp`.
 */
export function printCommandHelp(
  client: Client,
  commandName: string | undefined,
  tokens: ReadonlyArray<string>
): number | undefined {
  const found = findBuiltInCommand(commandName, tokens);
  if (!found) {
    return undefined;
  }
  const { root } = found;

  const target = resolveHelpTarget(root, found.tokens);
  if (target.unknownSegment !== undefined) {
    printUnknownCommand(client, target.unknownSegment, [
      root.name,
      ...target.typedPath,
    ]);
    return 2;
  }
  if (target.command.dynamicHelp) {
    return undefined;
  }

  const telemetry = new RootTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  telemetry.trackCliFlagHelp([root.name, ...target.typedPath].join(':'));
  client.stdout.write(
    help(target.command, {
      parent: target.parent,
      columns: client.stdout.columns ?? client.stderr.columns,
      stream: client.stdout,
    })
  );
  return 0;
}

/**
 * Answers a group run without a subcommand, such as `vercel env`: prints the
 * group's help on stdout and returns exit code 0. Returns `undefined` when
 * `tokens` reach a command that does work, so the command runs as usual.
 *
 * A group does work on its own when it takes arguments, has a default
 * subcommand, or sets `runsWithoutSubcommand`.
 */
export function printGroupHelp(
  client: Client,
  commandName: string | undefined,
  tokens: ReadonlyArray<string>
): number | undefined {
  const found = findBuiltInCommand(commandName, tokens);
  if (!found) {
    return undefined;
  }
  const { root } = found;
  const target = resolveHelpTarget(root, found.tokens);
  const { command } = target;
  if (
    target.unknownSegment !== undefined ||
    !command.subcommands?.length ||
    command.arguments.length > 0 ||
    command.runsWithoutSubcommand ||
    command.subcommands.some(subcommand => subcommand.default)
  ) {
    return undefined;
  }
  try {
    parseArguments(
      [...found.tokens],
      getFlagsSpecification(
        getCommandsAlongPath(root, target.typedPath).flatMap(
          ({ options }) => options
        )
      )
    );
  } catch (err) {
    printError(err, client);
    return 2;
  }
  client.stdout.write(
    help(command, {
      parent: target.parent,
      columns: client.stdout.columns ?? client.stderr.columns,
      stream: client.stdout,
    })
  );
  return 0;
}

/**
 * The options of the built-in command `tokens` resolve to, and of each group
 * on the way there, or `undefined` for a command that isn't built in.
 */
export function getCommandPathOptions(
  commandName: string | undefined,
  tokens: ReadonlyArray<string>
): CommandOption[] | undefined {
  const found = findBuiltInCommand(commandName, tokens);
  if (!found) {
    return undefined;
  }
  const { typedPath } = resolveHelpTarget(found.root, found.tokens);
  return getCommandsAlongPath(found.root, typedPath).flatMap(
    ({ options }) => options
  );
}

/**
 * Whether `argv` asks for the CLI version with `--version` or `-v`, at any
 * depth. A form the command defines itself keeps its meaning, as `redirects
 * list` has its own `--version` (which the global `-v` also sets) and some
 * `flags` commands read `-v` as `--variant`. Commands that aren't built in,
 * such as extensions and the external sandbox CLI, read their own argv.
 */
export function asksForVersion(
  commandName: string | undefined,
  argv: ReadonlyArray<string>
): boolean {
  let flags: { '--version'?: boolean; '-v'?: boolean };
  try {
    // `-v` as its own key tells the two forms apart.
    ({ flags } = parseArguments(
      argv.slice(2),
      { '--version': Boolean, '-v': Boolean },
      { permissive: true }
    ));
  } catch {
    return false;
  }
  const typedLong = flags['--version'] === true;
  const typedShort = flags['-v'] === true;
  if (!typedLong && !typedShort) {
    return false;
  }
  const found = findBuiltInCommand(commandName, tokensAfterCommand(argv));
  if (!found) {
    return false;
  }
  const { command, typedPath } = resolveHelpTarget(found.root, found.tokens);
  // A group with a default subcommand runs it, as `vercel flags` runs
  // `flags list`.
  const defaultSubcommand = command.subcommands?.find(
    subcommand => subcommand.default
  );
  if (
    command.forwardsUnknownOptions ||
    defaultSubcommand?.forwardsUnknownOptions
  ) {
    return false;
  }
  const options = getCommandsAlongPath(found.root, typedPath).flatMap(
    ({ options }) => options
  );
  if (defaultSubcommand) {
    options.push(...defaultSubcommand.options);
  }
  const definesLong = options.some(option => option.name === 'version');
  // The global `-v` is an alias of `--version`, so a command that defines its
  // own `--version` reads `-v` as that option too, as in `redirects list -v
  // <VERSION_ID>`.
  const definesShort =
    definesLong ||
    options.some(
      option => option.shorthand === 'v' || option.deprecatedShorthand === 'v'
    );
  return (typedLong && !definesLong) || (typedShort && !definesShort);
}

/**
 * Whether `vercel deploy` accepts every option in `argv`. An option the root
 * doesn't know, typed before any command as in `vercel --prod`, deploys;
 * deploy rejects one it doesn't take, such as `--disable-binary`.
 */
export function deployAcceptsOptions(argv: ReadonlyArray<string>): boolean {
  const deploy = findBuiltInCommand('deploy', []);
  if (!deploy) {
    return false;
  }
  try {
    parseArguments(argv.slice(2), getFlagsSpecification(deploy.root.options), {
      warnDeprecated: false,
    });
    return true;
  } catch {
    return false;
  }
}

/** `root` and each subcommand that `typedPath` walks through. */
function getCommandsAlongPath(
  root: Command,
  typedPath: ReadonlyArray<string>
): Command[] {
  const path = [root];
  for (const token of typedPath) {
    const subcommand = path[path.length - 1].subcommands?.find(
      candidate => candidate.name === token || candidate.aliases.includes(token)
    );
    if (!subcommand) {
      break;
    }
    path.push(subcommand);
  }
  return path;
}

/**
 * The registered command `commandName` names, unless it renders its own help,
 * with the tokens to resolve under it. A shortcut that is also the name of one
 * of the command's subcommands runs that subcommand, as `vercel switch` runs
 * `teams switch`, so the shortcut becomes the first token.
 */
function findBuiltInCommand(
  commandName: string | undefined,
  tokens: ReadonlyArray<string>
): { root: Command; tokens: ReadonlyArray<string> } | undefined {
  const name = commandName ? commands.get(commandName) : undefined;
  if (!commandName || !name || name === 'sandbox') {
    return undefined;
  }
  const findRoot = (rootName: string) =>
    commandsStructs.find(
      (command): command is Command =>
        command.name === rootName && 'options' in command
    );
  const root = findRoot(name);
  if (!root) {
    return undefined;
  }
  // `vercel alerts rules ...` is the hidden old name of `vercel monitors ...`
  // and answers with the help of the command it runs.
  const monitors = root.name === 'alerts' ? findRoot('monitors') : undefined;
  if (monitors) {
    const alias = takeAlertsRulesAlias(root, tokens);
    if (alias) {
      return { root: monitors, tokens: alias };
    }
  }
  const namesSubcommand =
    commandName !== root.name &&
    root.subcommands?.some(
      subcommand =>
        subcommand.name === commandName ||
        subcommand.aliases.includes(commandName)
    );
  return { root, tokens: namesSubcommand ? [commandName, ...tokens] : tokens };
}

/**
 * The tokens after `rules` when `tokens` run `vercel alerts rules`, whether or
 * not flags come before `rules`, as in `vercel alerts --scope acme rules ls`.
 */
function takeAlertsRulesAlias(
  alerts: Command,
  tokens: ReadonlyArray<string>
): string[] | undefined {
  try {
    const { command, args } = takeCommand(
      [...tokens],
      getFlagsSpecification(alerts.options)
    );
    return command === 'rules' ? args : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reports a command path that does not exist, such as `vercel env nope`, and
 * points to the help of the deepest group that does. The caller exits with
 * code 2.
 */
export function printUnknownCommand(
  client: Client,
  segment: string,
  groupPath: ReadonlyArray<string> = []
): void {
  const group = groupPath.join(' ');
  const message = `Unknown command ${segment} for ${getCommandNamePlain(group || undefined)}.`;
  const helpCommand = group ? `${group} --help` : '--help';
  if (shouldEmitNonInteractiveCommandError(client)) {
    writeAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: 'unknown_command',
      message,
      next: [
        {
          command: getCommandNamePlain(helpCommand),
          when: 'See all commands',
        },
      ],
    });
    return;
  }
  output.fatal(message);
  output.print(
    `\n  See all commands:\n${formatHelpCommand(getCommandNamePlain(helpCommand), [], createHelpTheme(client.stderr))}\n`
  );
}

/**
 * The argv tokens after the command name, e.g. `rules add --help` for
 * `vercel --scope acme firewall rules add --help`. Reads the raw argv so
 * command flags that share a letter with a global boolean, such as `-d`, keep
 * their values.
 */
export function tokensAfterCommand(argv: ReadonlyArray<string>): string[] {
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      return [];
    }
    if (arg.startsWith('-')) {
      if (!arg.includes('=') && globalCliFlagTakesValue(arg)) {
        i++;
      }
      continue;
    }
    return args.slice(i + 1);
  }
  return [];
}
