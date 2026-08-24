import { setPendingSubcommandNotFound } from './telemetry/reporter';

type CommandConfig = {
  [command: string]: string[];
};

interface SubcommandParsed {
  subcommand: string | string[];
  args: string[];
  subcommandOriginal: string;
}

export default function getSubcommand(
  cliArgs: string[],
  config: CommandConfig
): SubcommandParsed {
  // Reset on every call so a matched dispatch never leaves a stale token.
  setPendingSubcommandNotFound(undefined);
  const [subcommand, ...rest] = cliArgs;
  for (const k of Object.keys(config)) {
    if (k !== 'default' && config[k].indexOf(subcommand) !== -1) {
      return {
        subcommand: k,
        subcommandOriginal: subcommand,
        args: rest,
      };
    }
  }
  // Park the leading non-flag token; it is only reported if the command's
  // dispatcher actually rejects it (see getInvalidSubcommand).
  if (cliArgs.length > 0 && !cliArgs[0].startsWith('-')) {
    setPendingSubcommandNotFound(cliArgs[0]);
  }
  return {
    subcommand: config.default,
    subcommandOriginal: 'default',
    args: cliArgs,
  };
}
