import ansiEscapes from 'ansi-escapes';

const eraseLines = n => ansiEscapes.eraseLines(n);

export default eraseLines;
