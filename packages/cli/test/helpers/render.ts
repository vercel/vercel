import { client } from '../mocks/client';
import stripAnsi from 'strip-ansi';
import type { Prompt } from '@inquirer/type';

export async function render<TestedPrompt extends Prompt<any, any>>(
  prompt: TestedPrompt,
  props: Parameters<TestedPrompt>[0],
  options?: Parameters<TestedPrompt>[1]
) {
  const answer = prompt(props, {
    input: client.stdin,
    output: client.stderr,
    ...options,
  });

  // Wait for event listeners to be ready
  await Promise.resolve();
  await Promise.resolve();

  const events = {
    keypress(
      key:
        | string
        | {
            name?: string | undefined;
            ctrl?: boolean | undefined;
            meta?: boolean | undefined;
            shift?: boolean | undefined;
          }
    ) {
      if (typeof key === 'string') {
        client.stdin.emit('keypress', null, { name: key });
      } else {
        client.stdin.emit('keypress', null, key);
      }
    },
    type(text: string) {
      client.stdin.write(text);
      for (const char of text) {
        client.stdin.emit('keypress', null, { name: char });
      }
    },
  };

  return {
    answer,
    input: client.stdin,
    events,
    // Ensure the buffer is flushed before moving on
    step: () => Promise.resolve(),
    getScreen({ raw }: { raw?: boolean } = {}): string {
      const lastScreen = client.stderr.getLastChunk({ raw });
      return raw ? lastScreen : stripAnsi(lastScreen).trim();
    },
    getFullOutput(): string {
      return client.stderr.getFullOutput();
    },
  };
}
