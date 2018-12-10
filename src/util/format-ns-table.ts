import chalk from 'chalk';
import table from 'text-table';
import strlen from './strlen';

export default function formatNSTable(
  intendedNameServers: string[],
  currentNameServers: string[],
  { extraSpace = '' } = {}
) {
  const sortedIntended = intendedNameServers.sort();
  const sortedCurrent = currentNameServers.sort();
  const maxLength = Math.max(
    intendedNameServers.length,
    currentNameServers.length
  );
  const rows = [];

  for (let i = 0; i < maxLength; i++) {
    rows.push([sortedIntended[i] || '', sortedCurrent[i] || '']);
  }

  return table(
    [
      [chalk.gray('Intended Nameservers'), chalk.gray('Current Nameservers')],
      ...rows
    ],
    {
      align: ['l', 'l', 'l'],
      hsep: ' '.repeat(4),
      stringLength: strlen
    }
  ).replace(/^(.*)/gm, `${extraSpace}$1`);
}
