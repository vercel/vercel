import output from '../../output-manager';
import { getCommandName } from '../pkg-name';

/** `vercel budgets *` takes options only; reject AIG-style positionals. */
export function rejectUnexpectedArgs(args: string[], command: string): boolean {
  if (args.length === 0) {
    return false;
  }
  output.error(
    `Unexpected argument "${args[0]}". ${getCommandName(command)} takes options only.`
  );
  return true;
}
