import type Client from '../client';

export function canPrompt(client: Client): boolean {
  return Boolean(client.stdin.isTTY) && !client.nonInteractive;
}
