import chalk from 'chalk';

const printLine = (data: string[], sizes: number[]) =>
  data.reduce((line, col, i) => line + col.padEnd(sizes[i]), '');

/**
 * Print a table.
 */
export default function table(
  fieldNames: string[] = [],
  data: string[][] = [],
  margins: number[] = [],
  print: (str: string) => void
) {
  // Compute size of each column
  const sizes = data
    .reduce(
      (acc, row) =>
        row.map((col, i) => {
          const currentMaxColSize = acc[i] || 0;
          const colSize = (col && col.length) || 0;
          return Math.max(currentMaxColSize, colSize);
        }),
      fieldNames.map(col => col.length)
    )
    // Add margin to all columns except the last
    .map((size, i) => (i < margins.length && size + margins[i]) || size);

  // Print header
  print(chalk.grey(printLine(fieldNames, sizes)));
  print('\n');

  // Print content
  for (const row of data) {
    print(printLine(row, sizes));
    print('\n');
  }
}
