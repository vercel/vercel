import chalk from 'chalk';
import table from 'text-table';
import strlen from './strlen';

export default function zeitWorldTable() {
  return table(
    [
      [chalk.underline('a.zeit.world'), chalk.dim('96.45.80.1')],
      [chalk.underline('b.zeit.world'), chalk.dim('46.31.236.1')],
      [chalk.underline('c.zeit.world'), chalk.dim('43.247.170.1')]
    ],
    {
      align: ['l', 'l'],
      hsep: ' '.repeat(8),
      stringLength: strlen
    }
  ).replace(/^(.*)/gm, '    $1');
}
