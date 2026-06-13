import type Client from '../client';
import selectOrg from '../input/select-org';
import output from '../../output-manager';

export async function ensureTeam(client: Client): Promise<boolean> {
  if (client.config.currentTeam) {
    return true;
  }

  if (!client.stdin.isTTY) {
    output.error(
      'No team selected. Use `vercel --scope <team-slug> ai-gateway rules …` or run `vercel switch` first.'
    );
    return false;
  }

  const org = await selectOrg(
    client,
    'Which team owns these AI Gateway rules?'
  );
  if (org.type === 'team') {
    client.config.currentTeam = org.id;
    return true;
  }

  output.error(
    'AI Gateway rules are managed per team. Switch to a team scope and try again.'
  );
  return false;
}
