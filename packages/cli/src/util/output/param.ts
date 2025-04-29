import pc from 'picocolors';

export default function param(text: string) {
  return `${pc.gray('"')}${pc.bold(text)}${pc.gray('"')}`;
}
