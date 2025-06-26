import os from 'os';

export default function getDominantEOL(text: string) {
  const lines = (text.match(/\r\n|\n/g) ?? []) as Array<'\r\n' | '\n'>;

  const { '\n': LFCount, '\r\n': CRLFCount } = lines.reduce(
    (counter, lineEnding) => {
      counter[lineEnding] += 1;
      return counter;
    },
    { '\n': 0, '\r\n': 0 }
  );

  const dominantEOL = LFCount > CRLFCount ? '\n' : '\r\n';

  return LFCount === CRLFCount ? os.EOL : dominantEOL;
}
