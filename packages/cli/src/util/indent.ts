export default function indent(text: string, n: number) {
  return text
    .split('\n')
    .map(l => ' '.repeat(n) + l)
    .join('\n');
}
