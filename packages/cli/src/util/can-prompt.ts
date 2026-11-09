import type Client from './client';

export function canPrompt(client: Client): boolean {
  return Boolean(client.stdin.isTTY) && !client.nonInteractive;
}

/** Requires a terminal for both input and prompts, and never prompts in CI. */
export function canPromptOnTerminal(client: Client): boolean {
  return canPrompt(client) && Boolean(client.stderr.isTTY) && !process.env.CI;
}
