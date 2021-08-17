import chalk from 'chalk';
import { Route } from '@vercel/routing-utils';

const longestProperty = (routes: Route[], name: keyof Route): number => {
  const longestItem = routes.sort((a, b) => {
    const aName = a[name];
    const bName = b[name];
    const firstItem = typeof aName === 'string' ? aName.length : 0;
    const secondItem = typeof bName === 'string' ? bName.length : 0;

    return secondItem - firstItem;
  })[0];

  const val = longestItem[name];
  return typeof val === 'string' ? val.length : 0;
};

export default function routes(routes: Route[]) {
  let toPrint = '';

  const longestSrc = longestProperty(routes, 'src');
  const longestDest = longestProperty(routes, 'dest');

  const padding = 6;
  const space = ' '.repeat(padding);
  const destSpace = ' '.repeat(longestDest || 10);
  const arrow = chalk.grey('->');

  for (const item of routes) {
    if ('handle' in item) {
      toPrint += `${chalk.grey('╶')} ${chalk.cyan(item.handle)}`;
      continue;
    }

    const { src, dest, status, headers } = item;
    const last = routes.indexOf(item) === routes.length - 1;
    const suffix = last ? '' : `\n`;

    const finalSrc = chalk.cyan(src.padEnd(longestSrc + padding));
    const finalDest = dest
      ? `${arrow}${space}${dest}`
      : `  ${space}${destSpace}`;
    const finalStatus = status ? chalk.grey(`[${status}]`) : '';

    let finalHeaders = null;

    if (headers) {
      finalHeaders = `\n`;

      const headerKeys = Object.keys(headers);

      for (const header of headerKeys) {
        const value = headers[header];
        const last = headerKeys.indexOf(header) === headerKeys.length - 1;
        const suffix = last ? '' : `\n`;
        const prefix = chalk.grey(last ? '└──' : '├──');

        finalHeaders += `${prefix} ${header}: ${value}${suffix}`;
      }
    }

    const prefix = chalk.grey(finalHeaders ? '┌' : '╶');
    const fill = `${finalSrc}${finalDest}${space}${finalStatus}`;

    toPrint += `${prefix} ${fill}${finalHeaders || ''}${suffix}`;
  }

  return toPrint;
}
