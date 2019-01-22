import chalk from 'chalk';

const longestProperty = (routes, name) => {
  const longestItem = routes.sort((a, b) => {
    const firstItem = a[name] ? a[name].length : 0;
    const secondItem = b[name] ? b[name].length : 0;

    return secondItem - firstItem
  })[0];

  return longestItem[name].length;
};

export default routes => {
  let toPrint = '';

  const longestSrc = longestProperty(routes, 'src');
  const longestDest = longestProperty(routes, 'dest');

  const padding = 6;
  const space = ' '.repeat(padding);
  const destSpace = ' '.repeat(longestDest);
  const arrow = chalk.grey('->')

  for (const item of routes) {
    const { src, dest, status, headers } = item;
    const last = routes.indexOf(item) === (routes.length - 1);
    const suffix = last ? '' : `\n`;

    const finalSrc = chalk.cyan(src.padEnd(longestSrc + padding));
    const finalDest = dest ? `${arrow}${space}${dest}` : `  ${space}${destSpace}`;
    const finalStatus = status ? chalk.grey(`[${status}]`) : '';

    let finalHeaders = null;

    if (headers) {
      finalHeaders = `\n`;

      const headerKeys = Object.keys(headers);

      for (const header of headerKeys) {
        const value = headers[header];
        const last = headerKeys.indexOf(header) === (headerKeys.length - 1);
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
};
