import type Client from '../../util/client';
import getSubcommand from '../../util/get-subcommand';
import { tokensAfterCommand } from '../print-command-help';
import codingAgentsSetup from '../ai-gateway/coding-agents-setup';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

export default async function tokenPass(client: Client): Promise<number> {
  const originalArgv = [...client.argv];
  const tokens = tokensAfterCommand(originalArgv);
  const commandIndex = originalArgv.length - tokens.length - 1;
  if (originalArgv[commandIndex] === 'tokenpass') {
    warnDeprecatedSubcommand(client, 'tokenpass', 'token-pass');
  }
  const { args } = getSubcommand(tokens, { setup: ['setup'] });
  const forwarded = [
    ...originalArgv.slice(2, commandIndex),
    '--token-pass',
    ...args,
  ];
  client.setArgv([
    ...originalArgv.slice(0, 2),
    'ai-gateway',
    'coding-agents',
    'setup',
    ...forwarded,
  ]);
  try {
    return await codingAgentsSetup(client, forwarded);
  } finally {
    client.setArgv(originalArgv);
  }
}
