import chalk from 'chalk';

const printLine = (data: string[], sizes: number[]) =>
  data.reduce((line, col, i) => line + col.padEnd(sizes[i]), '');

/**
 * Print a table.
 */
export default function table(
  fieldNames: string[] = [],
  data: string[][] = [],
  margins: number[] = []
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
  console.log(chalk.grey(printLine(fieldNames, sizes)));

  // Print content
  for (const row of data) {
    console.log(printLine(row, sizes));
  }
}
