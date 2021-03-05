import ansiEscapes from 'ansi-escapes';

export default function eraseLines(numberOfLines: number) {
  return ansiEscapes.eraseLines(numberOfLines);
}
