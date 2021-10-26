import chalk from 'chalk';

const colors = [
  chalk.cyan,
  chalk.magenta,
  chalk.green,
  chalk.yellow,
  chalk.blue,
];

let childIndex = 0;
const packageNameColorCache = new Map<string, chalk.Chalk>();

/** Return a consistent (gradient) color for a given package name */
export function getColorForPkgName(pkgName: string) {
  let color = packageNameColorCache.get(pkgName);

  if (!color) {
    color = colors[childIndex++ % colors.length];
    packageNameColorCache.set(pkgName, color);
  }

  return color;
}
