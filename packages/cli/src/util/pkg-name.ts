import title from 'title';
import pkg from './pkg';
import cmd from './output/cmd';

/**
 * The package name defined in the CLI's `package.json` file (`vercel`).
 */
export const name = pkg.name;

/**
 * Unicode symbol used to represent the CLI.
 */
export const logo = '▲';

/**
 * Returns the package name such as `vercel` or `now`.
 */
export function getPkgName(): string {
  return pkg.name;
}

/**
 * Returns the package name with title-case
 * such as `Vercel` or `Now`.
 */
export function getTitleName(): string {
  const str = getPkgName();
  return title(str);
}

/**
 * Returns the package name with subcommand(s)
 * as a suffix such as `vercel env pull` or `now env pull`.
 */
export function getCommandName(subcommands?: string): string {
  let vercel = getPkgName();
  if (subcommands) {
    vercel = `${vercel} ${subcommands}`;
  }
  return cmd(vercel);
}
