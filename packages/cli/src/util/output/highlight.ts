import pc from 'picocolors';

export default function highlight(text: string): string {
  return pc.bold.underline(text);
}
