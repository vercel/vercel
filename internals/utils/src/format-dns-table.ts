import chalk from 'chalk';
import table from 'text-table';
import strlen from './strlen';

const HEADER = ['name', 'type', 'value'].map(v => chalk.gray(v));

export default function formatDNSTable(
  rows: string[][],
  { extraSpace = '' } = {}
) {
  return table([HEADER, ...rows], {
    align: ['l', 'l', 'l'],
    hsep: ' '.repeat(8),
    stringLength: strlen
  }).replace(/^(.*)/gm, `${extraSpace}$1`);
}
