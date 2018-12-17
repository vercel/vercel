import chalk from 'chalk';
import table from 'text-table';
import strlen from './strlen';
import chars from './output/chars';

export default function formatNSTable(
  intendedNameServers: string[],
  currentNameServers: string[],
  { extraSpace = '' } = {}
) {
  const sortedIntended = getSortedItems(intendedNameServers);
  const sortedCurrent = getSortedItems(currentNameServers);
  const maxLength = Math.max(
    intendedNameServers.length,
    currentNameServers.length
  );
  const rows = [];

  for (let i = 0; i < maxLength; i++) {
    rows.push([
      sortedIntended[i] || '',
      sortedCurrent[i] || '',
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

function getSortedItems(items: string[] = []) {
  return items.length === 0
    ? [chalk.gray('-')]
    : items.sort();
}
