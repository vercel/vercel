import type Client from '../../client';
import { isAPIError } from '../../errors-ts';
import { outputAgentError } from '../../agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../agent-output-constants';
import { UNSUPPORTED_AGENTS } from './agents';
import { buildSetupPlan, applyPlan, type SetupPlan } from './apply';
import type { KeySource } from './key-source';
import type { CodingAgent } from './types';

/**
 * Non-interactive / agent path: no prompts or diffs, emits a structured JSON
 * plan (dry run) or result. Mints the key only after deciding to write.
 */
export async function runMachine(args: {
  client: Client;
  selected: CodingAgent[];
  unsupported: string[];
  previewPlan: SetupPlan;
  dryRun: boolean;
  backup: boolean;
  keySource: KeySource | null;
  createKey: () => Promise<string>;
  home: string;
}): Promise<number> {
  const { client, selected, previewPlan, dryRun, backup, home } = args;

  const errored = previewPlan.changes.filter(c => c.status === 'error');
  const skipped: Array<{ target: string; reason: string; message?: string }> =
    errored.map(c => ({
      target: c.path,
      reason: 'unparseable_config',
      message: c.error,
    }));
  for (const id of args.unsupported) {
    skipped.push({
      target: id,
      reason: 'not_automatable',
      message: UNSUPPORTED_AGENTS[id],
    });
  }

  if (dryRun) {
    client.stdout.write(
      `${JSON.stringify(
        {
          status: AGENT_STATUS.OK,
          reason: 'dry_run',
          message:
            'Previewing AI Gateway coding-agent setup. No files written.',
          changes: previewPlan.changes.map(c => ({
            agent: c.owners.join(', '),
            file: c.path,
            action:
              c.status === 'create'
                ? 'would_create'
                : c.status === 'update'
                  ? 'would_update'
                  : c.status,
          })),
          skipped,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  let key: string;
  try {
    key = args.keySource ? args.keySource.key : await args.createKey();
  } catch (err) {
    if (isAPIError(err)) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: err.status === 403 ? 'forbidden' : AGENT_REASON.API_ERROR,
        message: err.message,
      });
    }
    throw err;
  }

  const finalPlan = args.keySource
    ? previewPlan
    : await buildSetupPlan(selected, { apiKey: key, home });
  const results = await applyPlan(finalPlan, { backup });

  client.stdout.write(
    `${JSON.stringify(
      {
        status: AGENT_STATUS.OK,
        reason: 'coding_agents_configured',
        message: `Configured ${results.length} file(s) across ${selected.length} agent(s) to use the AI Gateway.`,
        apiKey: key,
        configured: results.map(r => ({
          agent: r.owners.join(', '),
          file: r.path,
          action: r.action,
          backup: r.backupPath,
        })),
        skipped,
        notes: finalPlan.notes.flatMap(n =>
          n.notes.map(line => `${n.displayName}: ${line}`)
        ),
      },
      null,
      2
    )}\n`
  );
  return 0;
}
