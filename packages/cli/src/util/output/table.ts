import Table from 'cli-table3';

const defaultStyle = {
  'padding-left': 0,
  'padding-right': 2,
};

export const noBorderChars = {
  top: '',
  'top-mid': '',
  'top-left': '',
  'top-right': '',
  bottom: '',
  'bottom-mid': '',
  'bottom-left': '',
  'bottom-right': '',
  left: '',
  'left-mid': '',
  mid: '',
  'mid-mid': '',
  right: '',
  'right-mid': '',
  middle: '',
};

const alignMap = {
  l: 'left',
  c: 'center',
  r: 'right',
} as const;

export default function table(
  rows: string[][],
  opts?: { hsep?: number; align?: ('l' | 'c' | 'r')[] }
) {
  const table = new Table({
    style: {
      ...defaultStyle,
      'padding-right': opts?.hsep ?? defaultStyle['padding-right'],
    },
    chars: noBorderChars,
  });
  table.push(
    ...rows.map(row =>
      row.map((cell, i) => ({
        content: cell,
        hAlign: alignMap[opts?.align?.[i] ?? 'l'],
      }))
    )
  );
  return table.toString();
}
