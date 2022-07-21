import stripAnsi from 'strip-ansi';

export default function strlen(str: string) {
  return stripAnsi(str).length;
}
