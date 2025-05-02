import stripAnsi from './inline/strip-ansi';

export default function strlen(str: string) {
  return stripAnsi(str).length;
}
