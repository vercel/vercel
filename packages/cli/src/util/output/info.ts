import pc from 'picocolors';

// info('woot') === '> woot'
// info('woot', 'yay') === '> woot\nyay'
export default function info(...msgs: string[]) {
  return `${pc.gray('>')} ${msgs.join('\n')}`;
}
