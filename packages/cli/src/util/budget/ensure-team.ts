import type Client from '../client';
import type { BudgetTeam } from './api';
import getTeamByIdOrSlug from '../teams/get-team-by-id-or-slug';
import output from '../../output-manager';

/** Resolves the team this command will mutate. Identity is the slug, not `scope`. */
export async function resolveBudgetTeam(
  client: Client
): Promise<BudgetTeam | null> {
  const id = await client.resolveCurrentTeam();
  if (!id) {
    output.error(
      'No team selected. Use `vercel --scope <team-slug> budget …` or run `vercel switch` first.'
    );
    return null;
  }

  try {
    const team = await getTeamByIdOrSlug(client, id);
    return { id: team.id, slug: team.slug };
  } catch {
    return { id, slug: id };
  }
}
