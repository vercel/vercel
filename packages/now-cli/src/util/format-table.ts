import chalk from 'chalk';
import table from 'text-table';
import strlen from './strlen';

// header:
// [ 'a', 'b', 'c', ... ]
// align:
// ['l', 'l', 'r', ... ]
// data:
// [
//   {
//     name: 'name',
//     rows: [
//       [ col1, col2, col3, ... ],
//       [ col1, col2, col3, ... ]
//     ]
//   },
//   ...
// ]
export default function formatTable(
  header: string[],
  align: Array<'l' | 'r' | 'c' | '.'>,
  blocks: { name: string, rows: string[][] }[],
  hsep = '    '
) {
  const nrCols = header.length;
  const padding = [];
  let out = '\n';

  for (let i = 0; i < nrCols; i++) {
    padding[i] = blocks.reduce((acc, block) => {
      const maxLen = Math.max(...block.rows.map(row => strlen(`${row[i]}`)));
      return Math.max(acc, Math.ceil(maxLen / 8));
    }, 1);
  }

  for (const block of blocks) {
    if (block.name) {
      out += `${block.name}\n`;
    }

    const rows = [header.map(s => chalk.dim(s))].concat(block.rows);

    if (rows.length > 0) {
      rows[0][0] = ` ${rows[0][0]}`;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i].slice(0);
        row[0] = ` ${row[0]}`;
        for (let j = 0; j < nrCols; j++) {
          const col = `${row[j]}`;
          const al = align[j] || 'l';
          const pad =
            padding[j] > 1 ? ' '.repeat(padding[j] * 8 - strlen(col)) : '';
          rows[i][j] = al === 'l' ? col + pad : pad + col;
        }
      }
      out += table(rows, { align, hsep, stringLength: strlen });
    }
    out += '\n\n';
  }

  return out.slice(0, -1);
}
