import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { transfersSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { outputAgentError } from '../../util/agent-output';

export default async function transfers(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsed;
  try {
    parsed = parseArguments(
      argv,
      getFlagsSpecification(transfersSubcommand.options)
    );
  } catch (error) {
    printError(error);
    return 1;
  }

  const action = parsed.args[0];
  const installationId = parsed.flags['--installation-id'] as
    | string
    | undefined;
  if (!installationId) {
    output.error('Missing --installation-id.');
    return 2;
  }

  const formatResult = validateJsonOutput(parsed.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  try {
    if (action === 'ls' || action === 'list') {
      const transfersList = await client.fetch<Record<string, unknown>>(
        `/v1/integrations/installations/${encodeURIComponent(installationId)}/transfers`
      );
      if (asJson) {
        client.stdout.write(
          `${JSON.stringify({ transfers: transfersList }, null, 2)}\n`
        );
      } else {
        client.stdout.write(`${JSON.stringify(transfersList, null, 2)}\n`);
      }
      return 0;
    }

    if (action === 'accept') {
      const response = await client.fetch<Record<string, unknown>>(
        `/v1/integrations/installations/${encodeURIComponent(installationId)}/transfers/from-marketplace`,
        { method: 'POST', body: {}, json: true }
      );
      if (asJson) {
        client.stdout.write(
          `${JSON.stringify({ action, response }, null, 2)}\n`
        );
      } else {
        output.success('Transfer accepted.');
      }
      return 0;
    }

    if (action === 'reject' || action === 'discard') {
      const yes = Boolean(parsed.flags['--yes']);
      if (!yes) {
        if (client.nonInteractive) {
          outputAgentError(
            client,
            {
              status: 'error',
              reason: 'confirmation_required',
              message:
                'Rejecting/discarding a transfer requires --yes in non-interactive mode.',
            },
            1
          );
          return 1;
        }
        const confirmed = await client.input.confirm(
          'Discard this transfer request?',
          false
        );
        if (!confirmed) return 0;
      }

      const response = await client.fetch<Record<string, unknown>>(
        `/v1/integrations/installations/${encodeURIComponent(installationId)}/transfers/discard`,
        { method: 'POST', body: {}, json: true }
      );
      if (asJson) {
        client.stdout.write(
          `${JSON.stringify({ action, response }, null, 2)}\n`
        );
      } else {
        output.success('Transfer discarded.');
      }
      return 0;
    }

    output.error('Invalid action. Use: ls | accept | reject | discard');
    return 2;
  } catch (error) {
    printError(error);
    return 1;
  }
}
