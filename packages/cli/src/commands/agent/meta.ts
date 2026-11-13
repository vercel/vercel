import chalk from 'chalk';
import { getCommandName } from '../../util/pkg-name';

export interface Meta {
  header: (scope: string, url: string, note?: string) => void;
  status: (text: string) => void;
  tool: (summary: string) => void;
  toolError: (text: string) => void;
  hint: (text: string) => void;
  separator: () => void;
  error: (text: string) => void;
  approval: (sessionId: string) => void;
}

/**
 * One-shot metadata on stderr, styled apart from the answer on stdout: dim text under a ▲ header
 * and a separator before the answer. Without colors (pipes, NO_COLOR) the shape stays the same.
 */
export function createMeta(
  write: (text: string) => void,
  colors: boolean
): Meta {
  const c = new chalk.Instance({
    level: colors ? chalk.level || 1 : 0,
  });
  const line = (text: string): void => write(`${text}\n`);
  return {
    header(scope: string, url: string, note?: string): void {
      line(`${c.bold('▲ Vercel Agent')}${c.dim(` · ${scope}`)}`);
      line(c.dim(`  · ${url}${note ? ` (${note})` : ''}`));
    },
    status(text: string): void {
      line(c.dim(`  · ${text}`));
    },
    tool(summary: string): void {
      line(c.dim(`  ● ${summary}`));
    },
    toolError(text: string): void {
      line(c.red(`    ✗ ${text}`));
    },
    hint(text: string): void {
      line(c.yellow(`  ! ${text}`));
    },
    separator(): void {
      line(c.dim('─'.repeat(48)));
    },
    error(text: string): void {
      line(`${c.red.bold('Error:')} ${text}`);
    },
    approval(sessionId: string): void {
      line(c.yellow('\nThis plan needs your approval. Run one of:'));
      line(`  ${getCommandName(`agent --session ${sessionId} --approve`)}`);
      line(`  ${getCommandName(`agent --session ${sessionId} --reject`)}`);
    },
  };
}

export function formatAge(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return minutes < 1 ? 'just now' : `${minutes}m ago`;
}
