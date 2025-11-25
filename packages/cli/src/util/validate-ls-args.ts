import chalk from 'chalk';
import { getCommandName } from './pkg-name';
import output from '../output-manager';

export function validateLsArgs(
  commandName: string,
  args: string[],
  maxArgs: number = 0,
  exitCode: number = 1,
  usageString?: string
): number {
  if (args.length > maxArgs) {
    const usage = usageString || getCommandName(commandName);
    output.error(`Invalid number of arguments. Usage: ${chalk.cyan(usage)}`);
    return exitCode;
  }
  return 0;
}
