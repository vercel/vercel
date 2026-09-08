import type Client from '../../../util/client';
import output from '../../../output-manager';
import { detectExplicitScope } from '../../../util/get-scope';
import { resolveProjectContext } from '../../../util/projects/resolve-project-context';
import { MISSING_BOTH_MESSAGE } from '../scope-resolver';

export type ConfigScope =
  | { teamId: string; projectId: string }
  | { exitCode: number };

/**
 * Resolves the project the `traces config` subcommands act on, to ids.
 *
 * `traces get` forwards `--scope` and `--project` verbatim, because
 * `/v1/projects/traces` documents accepting a slug or an id for both. That does
 * not transfer to `/v9/projects/<idOrName>`, where the team travels as a
 * `teamId` query parameter that has to be an id: `client.fetch` drops a slug
 * rather than sending it, which resolves the project in the personal account
 * instead of the team that was asked for. Two accounts can hold a project of
 * the same name, so that silence is a write to the wrong project.
 *
 * The shared project resolver is therefore used instead of the flags: it turns
 * `--project` into a project id inside the scope `--scope` already selected,
 * and reports a project it cannot find before any request is made.
 */
export async function resolveConfigScope(
  client: Client,
  flags: { project?: string }
): Promise<ConfigScope> {
  const link = await resolveProjectContext({
    client,
    projectNameOrId: flags.project,
  });
  if (link.status === 'error') {
    return { exitCode: link.exitCode };
  }
  if (link.status === 'not_linked') {
    output.error(MISSING_BOTH_MESSAGE);
    return { exitCode: 1 };
  }

  // A linked directory names its own team, so `--scope` has nothing left to
  // select: it can only disagree. Saying so is the point — the alternative is
  // reading one project and reporting it under another team's name.
  if (
    flags.project === undefined &&
    detectExplicitScope(client) &&
    link.org.id !== client.config.currentTeam
  ) {
    output.error(
      `The linked project ${link.project.name} belongs to ${link.org.slug || link.org.id}, which is not the scope that was passed. Pass --project <name> to act on a project in that scope.`
    );
    return { exitCode: 1 };
  }

  return { teamId: link.org.id, projectId: link.project.id };
}
