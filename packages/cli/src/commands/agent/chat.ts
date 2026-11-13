import type Client from '../../util/client';
import { ensureLink } from '../../util/link/ensure-link';
import { getCommandName } from '../../util/pkg-name';
import type { AgentFlags } from './flags';
import { looksLikeProject } from './link';
import { resolveTarget } from './session';

/**
 * `vercel agent` in a terminal: the full-screen chat. It first offers to link the directory when
 * it looks like a project but is not linked.
 */
export default async function chat(
  client: Client,
  flags: AgentFlags
): Promise<number> {
  const options = {
    project: flags['--project'],
    session: flags['--session'],
    continue: flags['--continue'],
  };
  let target = await resolveTarget(client, options);
  // The TUI loads only for the chat, never for one-shot questions.
  const { askToLink, startTui } = await import('./tui');
  const needsLink =
    !target.context.project &&
    !flags['--project'] &&
    looksLikeProject(client.cwd);
  if (needsLink && (await askToLink(client.cwd, getCommandName('link')))) {
    const link = await ensureLink('agent', client, client.cwd);
    if (typeof link === 'number' && link !== 0) return link;
    if (typeof link !== 'number') target = await resolveTarget(client, options);
  }
  return startTui(target);
}
