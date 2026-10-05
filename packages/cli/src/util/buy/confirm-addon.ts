import type Client from '../client';
import output from '../../output-manager';
import { printAlignedLabel } from '../output/print-aligned-label';
import { AGENT_REASON } from '../agent-output-constants';

export type AddonConfirmation = 'confirmed' | 'declined' | 'required';

export async function confirmAddon(
  client: Client,
  {
    yes,
    asJson = false,
    summary,
    prompt = 'Enable this add-on?',
  }: {
    yes: boolean;
    asJson?: boolean;
    summary: [string, string][];
    prompt?: string;
  }
): Promise<AddonConfirmation> {
  for (const [label, value] of summary) {
    printAlignedLabel(label, value);
  }

  if (yes) {
    return 'confirmed';
  }

  if (!client.stdin.isTTY || client.nonInteractive || asJson) {
    const message =
      'Confirmation required. Use --yes to accept the pricing and skip the confirmation prompt.';
    if (asJson || client.nonInteractive) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: 'action_required',
            reason: AGENT_REASON.CONFIRMATION_REQUIRED,
            message,
            summary: Object.fromEntries(summary),
          },
          null,
          2
        )}\n`
      );
    }
    output.error(message);
    return 'required';
  }

  return (await client.input.confirm(prompt, false)) ? 'confirmed' : 'declined';
}
