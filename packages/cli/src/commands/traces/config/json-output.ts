import type { Project } from '@vercel-internals/types';
import type Client from '../../../util/client';
import { AGENT_STATUS } from '../../../util/agent-output-constants';

export type NextCommand = { command: string; when: string };

/**
 * Writes the machine-readable result for a `traces config` subcommand.
 *
 * There are two tiers. Plain `--json` prints only `bare`, so the output can be
 * piped into another tool. A non-interactive run prints the agent envelope,
 * which wraps the same data with the project, a status, a message, and
 * suggested next commands. Both tiers live here so the three subcommands cannot
 * drift apart, and so prose never reaches stdout by accident.
 */
export function writeConfigJson(
  client: Client,
  {
    project,
    bare,
    envelope,
    message,
    next,
  }: {
    project: Project;
    /** What plain `--json` prints. */
    bare: unknown;
    /** The same data keyed for the envelope, plus any extra context. */
    envelope: Record<string, unknown>;
    message: string;
    next: NextCommand[];
  }
): void {
  if (!client.nonInteractive) {
    client.stdout.write(`${JSON.stringify(bare, null, 2)}\n`);
    return;
  }

  client.stdout.write(
    `${JSON.stringify(
      {
        status: AGENT_STATUS.OK,
        projectId: project.id,
        projectName: project.name,
        ...envelope,
        message,
        next,
      },
      null,
      2
    )}\n`
  );
}
