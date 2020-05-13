// @ts-ignore
import title from 'title';

import pkg from './pkg';
import cmd from './output/cmd';

/**
 * Returns the package name such as `vercel` or `now`.
 */
export function getPkgName(): string {
  if (!pkg.name) {
    throw new Error('Expected `package.json` to have a `name` property.');
  }
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
