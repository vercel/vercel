import pkg from './pkg';
import cmd from './output/cmd';

export function getPkgName(): string {
  if (!pkg.name) {
    throw new Error('Expected package.json to have a `name` property.');
  }
  return pkg.name;
}

export function getCommandName() {
  return cmd(getPkgName());
}
