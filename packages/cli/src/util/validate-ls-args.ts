import chalk from 'chalk';
import { getCommandName } from './pkg-name';
import output from '../output-manager';

export function validateLsArgs(options: {
  commandName: string;
  args: string[];
  maxArgs?: number;
  exitCode?: number;
  usageString?: string;
}): number {
  const { commandName, args, maxArgs = 0, exitCode = 1, usageString } = options;

  if (args.length > maxArgs) {
    const usage = usageString || getCommandName(commandName);
    output.error(`Invalid number of arguments. Usage: ${chalk.cyan(usage)}`);
    return exitCode;
  }
  return 0;
}
