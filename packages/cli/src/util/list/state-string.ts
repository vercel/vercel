import chalk from 'chalk';
import title from 'title';

export function stateString(s: string) {
  const CIRCLE = '● ';
  const sTitle = s && title(s);
  switch (s) {
    case 'INITIALIZING':
    case 'BUILDING':
    case 'DEPLOYING':
    case 'ANALYZING':
      return chalk.yellow(CIRCLE) + sTitle;
    case 'ERROR':
      return chalk.red(CIRCLE) + sTitle;
    case 'READY':
      return chalk.green(CIRCLE) + sTitle;
    case 'QUEUED':
      return chalk.white(CIRCLE) + sTitle;
    case 'CANCELED':
      return chalk.gray(sTitle);
    default:
      return chalk.gray('  --');
  }
}
