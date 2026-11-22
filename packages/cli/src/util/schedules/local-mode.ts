import arg from 'arg';
import type { Command } from '../../commands/help';
import {
  executionsListSubcommand,
  schedulesCommand,
} from '../../commands/schedules/command';
import { parseArguments } from '../get-args';
import getCommonArgs from '../arg-common';
import { getFlagsSpecification } from '../get-flags-specification';

const flagsSpecification = {
  ...getFlagsSpecification([
    ...schedulesCommand.options,
    ...(schedulesCommand.subcommands as readonly Command[]).flatMap(
      command => command.options
    ),
    ...executionsListSubcommand.options,
  ]),
  '--local': Boolean,
  '-L': '--local',
  '--changelog': Boolean,
};

// Parse values as well as flags: a namespace or payload can contain "--local".
// Keep the full argv shape so bootstrap can use the same parsed global flags.
export function parseSchedulesArguments(argv: string[]) {
  // This runs at startup for every command, before the command parses its own
  // flags, so it must not print deprecation warnings.
  const parsed = parseArguments(argv.slice(2), flagsSpecification, {
    warnDeprecated: false,
  });
  return { ...parsed, args: [...argv.slice(0, 2), ...parsed.args] };
}

// Only inspect the command prefix. Malformed options after it must not turn a
// schedules invocation into a cloud-authenticated fallback during bootstrap.
export function isSchedulesCommand(argv: string[]): boolean {
  try {
    const { _: args } = arg(
      { ...getCommonArgs(), ...flagsSpecification },
      { argv: argv.slice(2), stopAtPositional: true }
    );
    return (
      args[0] === 'schedules' || (args[0] === 'help' && args[1] === 'schedules')
    );
  } catch {
    return false;
  }
}

export function isLocalSchedulesCommand(argv: string[]): boolean {
  try {
    const { args, flags } = parseSchedulesArguments(argv);
    return (
      (args[2] === 'schedules' ||
        (args[2] === 'help' && args[3] === 'schedules')) &&
      flags['--local'] === true
    );
  } catch {
    return false;
  }
}

// Recover output preferences after a syntax error without mistaking option
// values for flags. This tolerant scan must never authorize or dispatch work.
export function getSchedulesErrorContext(argv: string[]): {
  local: boolean;
  nonInteractive: boolean | undefined;
} {
  const spec: arg.Spec = { ...getCommonArgs(), ...flagsSpecification };
  let local = false;
  let nonInteractive: boolean | undefined;
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') break;
    if (!token.startsWith('-') || token === '-') continue;
    const options = token.startsWith('--')
      ? [token]
      : [...token.slice(1)].map(letter => `-${letter}`);
    for (let j = 0; j < options.length; j++) {
      const [option, value] = options[j].split(/=(.*)/, 2);
      const name = typeof spec[option] === 'string' ? spec[option] : option;
      const handler = spec[name];
      if (!handler) break;
      if (handler !== Boolean) {
        // arg rejects attached short-option values, such as -tL. Do not
        // reinterpret the remainder as local or output-mode flags.
        if (j < options.length - 1) break;
        const next = argv[i + 1];
        if (
          value === undefined &&
          next !== undefined &&
          (!next.startsWith('-') ||
            next === '-' ||
            (handler === Number && /^-?\d*(\.(?=\d))?\d*$/.test(next)))
        ) {
          i++;
        }
        continue;
      }
      if (name === '--local') local = true;
      if (name === '--non-interactive') {
        const separateFalse = value === undefined && argv[i + 1] === 'false';
        if (value === 'false' || separateFalse) {
          nonInteractive = false;
          if (separateFalse) i++;
        } else if (nonInteractive !== false) {
          nonInteractive = true;
        }
      }
    }
  }
  return { local, nonInteractive };
}
