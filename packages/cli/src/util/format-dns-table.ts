import { gray } from 'chalk';
import table from './output/table';

const HEADER = ['name', 'type', 'value'].map(v => gray(v));

export default function formatDNSTable(rows: string[][]) {
  return table([HEADER, ...rows], { hsep: 8 });
}
