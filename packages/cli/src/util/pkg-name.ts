import title from 'title';
import pkg from './pkg';
import cmd from './output/cmd';

/**
 * The package name defined in the CLI's `package.json` file (`vercel`).
 */
export const packageName = pkg.name;

/**
 * Unicode symbol used to represent the CLI.
 */
export const logo = '▲';

/**
 * Returns the package name with title-case
 * such as `Vercel` or `Now`.
 */
export function getTitleName(): string {
  const str = packageName;
  return title(str);
}

/**
 * Returns the package name with subcommand(s)
 * as a suffix such as `vercel env pull` or `now env pull`.
 */
export function getCommandName(subcommands?: string): string {
  let vercel = packageName;
  if (subcommands) {
    vercel = `${vercel} ${subcommands}`;
  }
  return cmd(vercel);
}

/**
 * Plain (unstyled) command string for JSON output, e.g. "vercel open".
 * Use this in action_required payloads so JSON doesn't contain ANSI escape codes.
 */
export function getCommandNamePlain(subcommands?: string): string {
  return subcommands ? `${packageName} ${subcommands}` : packageName;
}
