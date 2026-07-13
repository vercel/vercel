import type Client from '../../client';
import { isAPIError } from '../../errors-ts';
import { outputAgentError } from '../../agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../agent-output-constants';
import { UNSUPPORTED_AGENTS } from './agents';
import { buildSetupPlan, applyPlan, type SetupPlan } from './apply';
import { storeKeyInKeychain } from './keychain';
import type { KeySource } from './key-source';
import type { CodingAgent } from './types';

export async function runMachine(args: {
  client: Client;
  selected: CodingAgent[];
  unsupported: string[];
  previewPlan: SetupPlan;
  dryRun: boolean;
  backup: boolean;
  keySource: KeySource | null;
  createKey: () => Promise<string>;
  useKeychain: boolean;
  overrides?: Record<string, string>;
  shellRcOverride?: string;
  home: string;
  alreadyConfigured: boolean;
  reconfigure: boolean;
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

  // Idempotent by default: if nothing needs writing and we weren't asked to
  // reconfigure, report the no-op without minting a fresh key.
  if (args.alreadyConfigured && !args.reconfigure) {
    let message =
      'All selected agents are already configured for the AI Gateway. Pass --reconfigure to rotate the key.';
    // A provided key on a Keychain setup: refresh the stored secret in place,
    // mirroring the interactive flow (the config files never carry the key).
    if (args.useKeychain && args.keySource) {
      if (!storeKeyInKeychain(args.keySource.key)) {
        client.stdout.write(
          `${JSON.stringify(
            {
              status: AGENT_STATUS.ERROR,
              reason: 'keychain_error',
              message:
                'Failed to update the key in the macOS Keychain. Re-run with --no-keychain to write it to the config files instead.',
            },
            null,
            2
          )}\n`
        );
        return 1;
      }
      message =
        'All selected agents are already configured; updated the macOS Keychain with the provided key.';
    }
    client.stdout.write(
      `${JSON.stringify(
        {
          status: AGENT_STATUS.OK,
          reason: 'already_configured',
          message,
          configured: [],
          skipped: [],
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  const applicable = previewPlan.changes.filter(
    c =>
      (c.status === 'create' || c.status === 'update') && c.format !== 'shell'
  );
  if (applicable.length === 0 && errored.length > 0) {
    client.stdout.write(
      `${JSON.stringify(
        {
          status: AGENT_STATUS.ERROR,
          reason: 'unparseable_config',
          message: "Couldn't write any agent configurations.",
          skipped,
        },
        null,
        2
      )}\n`
    );
    return 1;
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

  const useKeychain = args.useKeychain && storeKeyInKeychain(key);

  const finalPlan = await buildSetupPlan(selected, {
    apiKey: key,
    home,
    useKeychain,
    overrides: args.overrides,
    shellRcOverride: args.shellRcOverride,
  });
  const results = await applyPlan(finalPlan, { backup });

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
