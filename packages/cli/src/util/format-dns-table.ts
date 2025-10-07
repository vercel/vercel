import table from './output/table';
import chalk from 'chalk';

const HEADER = ['name', 'type', 'value'].map(v => chalk.gray(v));

export default function formatDNSTable(rows: string[][]) {
  return table([HEADER, ...rows], { hsep: 8 });
}
