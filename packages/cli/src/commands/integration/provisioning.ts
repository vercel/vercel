import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { provisioningSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';

export default async function provisioning(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsed;
  try {
    parsed = parseArguments(
      argv,
      getFlagsSpecification(provisioningSubcommand.options)
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
    if (action === 'status') {
      const response = await client.fetch<Record<string, unknown>>(
        `/v1/integrations/installations/${encodeURIComponent(installationId)}/billing/provision`,
        { method: 'GET' }
      );
      if (asJson) {
        client.stdout.write(
          `${JSON.stringify({ action, response }, null, 2)}\n`
        );
      } else {
        client.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
      }
      return 0;
    }

    if (action === 'trigger') {
      const response = await client.fetch<Record<string, unknown>>(
        `/v1/integrations/installations/${encodeURIComponent(installationId)}/billing/provision`,
        { method: 'POST', body: {}, json: true }
      );
      if (asJson) {
        client.stdout.write(
          `${JSON.stringify({ action, response }, null, 2)}\n`
        );
      } else {
        output.success('Provisioning triggered.');
      }
      return 0;
    }

    output.error('Invalid action. Use: status | trigger');
    return 2;
  } catch (error) {
    printError(error);
    return 1;
  }
}
