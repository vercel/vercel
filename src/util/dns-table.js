import chalk from 'chalk';
import table from 'text-table';
import strlen from './strlen';

const OPTIONS = {
  align: ['l', 'l', 'l'],
  hsep: ' '.repeat(8),
  stringLength: strlen
};

const HEADER = ['name', 'type', 'value'].map(v => chalk.gray(v));

export default function dnsTable(rows, { extraSpace = '' } = {}) {
  return table([HEADER, ...rows], OPTIONS).replace(
    /^(.*)/gm,
    `${extraSpace}  $1`
  );
}
