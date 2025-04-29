import pc from 'picocolors';

export default function cmd(text: string) {
  return `${pc.gray('`')}${pc.cyan(text)}${pc.gray('`')}`;
}
