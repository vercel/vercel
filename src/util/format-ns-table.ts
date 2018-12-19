import chalk from 'chalk';
import table from 'text-table';
import strlen from './strlen';
import chars from './output/chars';

export default function formatNSTable(
  intendedNameservers: string[],
  currentNameservers: string[],
  { extraSpace = '' } = {}
) {
  const sortedIntended = intendedNameservers.sort();
  const sortedCurrent = currentNameservers.sort();
  const maxLength = Math.max(
    intendedNameservers.length,
    currentNameservers.length
  );
  const rows = [];

  for (let i = 0; i < maxLength; i++) {
    rows.push([
      sortedIntended[i] || chalk.gray('-'),
      sortedCurrent[i] || chalk.gray('-'),
      sortedIntended[i] === sortedCurrent[i]
        ? chalk.green(chars.tick)
        : chalk.red(chars.cross)
    ]);
  }

  return table(
    [
      [chalk.gray('Intended Nameservers'), chalk.gray('Current Nameservers'), ''],
      ...rows
    ],
    {
      align: ['l', 'l', 'l', 'l'],
      hsep: ' '.repeat(4),
      stringLength: strlen
    }
  ).replace(/^(.*)/gm, `${extraSpace}$1`);
}
