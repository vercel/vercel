import type Client from '../../util/client';
import output from '../../output-manager';
import { buildCommandWithYes } from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { fail } from './shared';

/**
 * Asks before a destructive change. `--yes` is consent; without it, a run
 * that can't prompt fails with `confirmation_required` and the preview in
 * `data.effects`, so an agent asks a human first.
 *
 * Returns true to go ahead, or the exit code to return.
 */
export async function confirmOrFail(
  client: Client,
  json: boolean,
  opts: {
    yes: boolean;
    interactive: boolean;
    /** Rows printed before the question, on stderr. */
    preview: string[];
    question: string;
    /** The action and its ID for the error, such as `pause drain drn_123`. */
    action: string;
    /** What happens, for the agent's `when`, in lowercase. */
    consequence: string;
    effects: string[];
  }
): Promise<true | number> {
  if (opts.yes) return true;

  if (!opts.interactive) {
    return fail(client, json, {
      reason: AGENT_REASON.CONFIRMATION_REQUIRED,
      message: `Can't ${opts.action} without confirmation in non-interactive mode.`,
      next: [
        {
          command: buildCommandWithYes(client.argv),
          when: `Only after a human approves: ${opts.consequence}`,
          full: true,
        },
      ],
      userActionRequired: true,
      data: { effects: opts.effects },
    });
  }

  output.print(`${opts.preview.join('\n')}\n`);
  const confirmed = await client.input.confirm(opts.question, false);
  if (!confirmed) {
    output.print('  Canceled. Nothing was changed.\n');
    return 130;
  }
  return true;
}
