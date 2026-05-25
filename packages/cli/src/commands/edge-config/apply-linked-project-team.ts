import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';

/**
 * Edge Config resources are team-scoped. By default, scope every
 * `edge-config` subcommand to the team of the locally linked project —
 * matching the behavior of `vc env`, `vc crons`, etc. If no project is
 * linked, fall back to the team configured globally (or via `--scope`),
 * so the command remains usable from any directory.
 *
 * Returns `undefined` on success, or an exit code if the link lookup
 * itself errored.
 */
export async function applyLinkedProjectTeam(
  client: Client
): Promise<number | undefined> {
  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  }
  if (link.status === 'linked') {
    client.config.currentTeam =
      link.org.type === 'team' ? link.org.id : undefined;
  }
  return undefined;
}
