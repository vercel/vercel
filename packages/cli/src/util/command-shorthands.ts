import type { Command, CommandOption } from '../commands/help';
import { globalCommandOptions } from './arg-common';
import { getShortFlags } from './get-flags-specification';

type CommandNode = Pick<Command, 'name' | 'aliases'> &
  Partial<Pick<Command, 'arguments' | 'options'>> & {
    readonly subcommands?: ReadonlyArray<CommandNode>;
  };

// Global short flags a command can take back as its own hidden letter. `-d`
// is `--debug`, but `flags create` keeps it as the old short form of
// `--description`. `-v` (`--variant`) and `-t` (`--content-type`) stay
// global until the next major, because some of their forms exit 0 today.
const COMMAND_SHORTHANDS = new Set(['-d']);

/**
 * Walks `args` from `start` the way the root parse and the routers read them,
 * starting at the group whose subcommands are `commands`. A flag's value is
 * skipped by the global options first, then by the options of the commands
 * selected so far. Calls `visit` with each short flag's index, the command
 * selected so far, and how many of that command's arguments came before it;
 * `visit` returns `true` when the flag takes the next token as its value.
 */
function walkCommandArgs(
  commands: ReadonlyArray<CommandNode>,
  args: ReadonlyArray<string>,
  start: number,
  visit: (index: number, command: CommandNode, argumentCount: number) => boolean
) {
  let command: CommandNode = { name: '', aliases: [], subcommands: commands };
  const options: CommandOption[] = [...globalCommandOptions];
  let argumentCount = 0;
  for (let i = start; i < args.length; i++) {
    const token = args[i];
    if (token === '--') {
      return;
    }
    if (token.length > 1 && token.startsWith('-')) {
      if (visit(i, command, argumentCount)) {
        i++;
      } else if (!token.includes('=') && takesValue(token, options)) {
        i++;
      }
      continue;
    }
    const subcommand =
      argumentCount === 0
        ? command.subcommands?.find(
            candidate =>
              candidate.name === token || candidate.aliases.includes(token)
          )
        : undefined;
    if (subcommand) {
      command = subcommand;
      options.push(...(subcommand.options ?? []));
    } else {
      argumentCount++;
    }
  }
}

function takesValue(token: string, options: ReadonlyArray<CommandOption>) {
  // In a group like `-yk`, only the last letter can take a value.
  const flag = /^-[A-Za-z]{2,}$/.test(token) ? `-${token.slice(-1)}` : token;
  const option = options.find(
    candidate =>
      `--${candidate.name}` === flag || getShortFlags(candidate).includes(flag)
  );
  return option !== undefined && option.type !== Boolean;
}

function findHiddenOption(command: CommandNode, flag: string) {
  return command.options?.find(
    option => `-${option.deprecatedShorthand}` === flag
  );
}

/**
 * Finds the global short flags in `args` that belong to the command they
 * select, as `-d` for `--description` in
 * `flags create checkout -d "Checkout flow"`. One does when the command keeps
 * it as a hidden letter, it comes after the command's required arguments,
 * and a value follows it. Anywhere else it stays global: `flags create -d
 * checkout` and `flags create checkout -d` still turn on debug output.
 * Returns their indexes in `args`, for `parseArguments`' `commandShorthands`.
 */
export function findCommandShorthands(
  commands: ReadonlyArray<CommandNode>,
  args: ReadonlyArray<string>,
  start = 0
): Set<number> {
  const found = new Set<number>();
  walkCommandArgs(commands, args, start, (index, command, argumentCount) => {
    const next = args[index + 1];
    const required = (command.arguments ?? []).filter(
      argument => argument.required
    ).length;
    if (
      !COMMAND_SHORTHANDS.has(args[index]) ||
      !findHiddenOption(command, args[index]) ||
      argumentCount < required ||
      next === undefined ||
      next.startsWith('-')
    ) {
      return false;
    }
    found.add(index);
    return true;
  });
  return found;
}

/**
 * The option of the selected command that keeps `flag`, a global short flag
 * like `-t`, as its hidden letter, when `flag` is typed after the command.
 * The global option still wins, so its errors can point to the command's
 * long name instead, as in `blob put f.txt -t text/plain`.
 */
export function findHiddenShorthandOption(
  commands: ReadonlyArray<CommandNode>,
  args: ReadonlyArray<string>,
  flag: string,
  start = 0
): CommandOption | undefined {
  let found: CommandOption | undefined;
  walkCommandArgs(commands, args, start, (index, command) => {
    if (args[index] === flag) {
      found ??= findHiddenOption(command, flag);
    }
    return false;
  });
  return found;
}
