import type Client from '../client';
import selectOrg from '../input/select-org';
import output from '../../output-manager';

export async function ensureTeam(client: Client): Promise<boolean> {
  if (await client.resolveCurrentTeam()) {
    return true;
  }

  // Three separate conditions: `nonInteractive` misses an agent attached to a
  // pty, and neither covers a plain piped invocation.
  if (client.nonInteractive || client.isAgent || !client.stdin.isTTY) {
    output.error(
      'No team selected. Use `vercel --scope <team-slug> ai-gateway …` or run `vercel switch` first.'
    );
    return false;
  }

  const org = await selectOrg(client, 'Which team?');
  if (org.type === 'team') {
    client.config.currentTeam = org.id;
    return true;
  }

  output.error(
    'AI Gateway resources are managed per team. Switch to a team scope and try again.'
  );
  return false;
}
