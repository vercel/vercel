import type Client from '../../client';
import { AGENT_STATUS } from '../../agent-output-constants';
import { UNSUPPORTED_AGENTS } from './agents';
import { buildSetupPlan, applyPlan } from './apply';
import type { CodingAgent } from './types';

export async function runMachine(args: {
  client: Client;
  selected: CodingAgent[];
  unsupported: string[];
  key: string;
  backup: boolean;
  home: string;
}): Promise<number> {
  const { client, selected, key, backup, home } = args;

  const plan = await buildSetupPlan(selected, { apiKey: key, home });

  const errored = plan.changes.filter(c => c.status === 'error');
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

  const results = await applyPlan(plan, { backup });

  client.stdout.write(
    `${JSON.stringify(
      {
        status: AGENT_STATUS.OK,
        reason: 'coding_agents_configured',
        message: `Configured ${results.length} ${
          results.length === 1 ? 'file' : 'files'
        } across ${selected.length} ${
          selected.length === 1 ? 'agent' : 'agents'
        } to use the AI Gateway.`,
        apiKey: key,
        configured: results.map(r => ({
          agent: r.owners.join(', '),
          file: r.path,
          action: r.action,
          backup: r.backupPath,
        })),
        skipped,
        notes: plan.notes.flatMap(n =>
          n.notes.map(line => `${n.displayName}: ${line}`)
        ),
      },
      null,
      2
    )}\n`
  );
  return 0;
}
