import stripAnsi from 'strip-ansi';

/**
 * Pads each cell in a grid so columns align in the terminal (ANSI-safe).
 * Appends spaces after styled strings without altering escape codes.
 */
export function alignColumnCells(rows: string[][], gap = 2): string[] {
  if (rows.length === 0) {
    return [];
  }
  const colCount = rows[0].length;
  const maxWidths = new Array(colCount).fill(0);

  for (const row of rows) {
    for (let c = 0; c < colCount; c++) {
      const cell = row[c] ?? '';
      maxWidths[c] = Math.max(maxWidths[c], stripAnsi(cell).length);
    }
  }

  const gapStr = ' '.repeat(gap);
  return rows.map(row =>
    row
      .map((cell, c) => padStyledCellToWidth(cell, maxWidths[c]))
      .join(gapStr)
  );
}

function padStyledCellToWidth(cell: string, width: number): string {
  const visible = stripAnsi(cell).length;
  return cell + ' '.repeat(Math.max(0, width - visible));
}
