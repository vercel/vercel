import table from './output/table';
import { gray } from 'picocolors';

const HEADER = ['name', 'type', 'value'].map(v => gray(v));

export default function formatDNSTable(rows: string[][]) {
  return table([HEADER, ...rows], { hsep: 8 });
}
