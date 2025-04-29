import pc from 'picocolors';
import table from './output/table';
import chars from './output/chars';

export default function formatNSTable(
  intendedNameservers: string[],
  currentNameservers: string[],
  { extraSpace = '' } = {}
) {
  const sortedIntended = intendedNameservers.sort();
  const sortedCurrent = currentNameservers.sort();
  const maxLength = Math.max(
    intendedNameservers.length,
    currentNameservers.length
  );
  const rows = [];

  for (let i = 0; i < maxLength; i++) {
    rows.push([
      sortedIntended[i] || pc.gray('-'),
      sortedCurrent[i] || pc.gray('-'),
      sortedIntended[i] === sortedCurrent[i]
        ? pc.green(chars.tick)
        : pc.red(chars.cross),
    ]);
  }

  return table(
    [
      [pc.gray('Intended Nameservers'), pc.gray('Current Nameservers'), ''],
      ...rows,
    ],
    { hsep: 4 }
  ).replace(/^(.*)/gm, `${extraSpace}$1`);
}
