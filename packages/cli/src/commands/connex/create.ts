import open from 'open';
import output from '../../output-manager';
import type Client from '../../util/client';
import type { JSONObject } from '@vercel-internals/types';
import { validateJsonOutput } from '../../util/output-format';
import { printError } from '../../util/error';
import { getProjectLink } from '../../util/projects/link';
import { selectConnexTeam } from '../../util/connex/select-team';
import {
  generateRequestCode,
  awaitConnexResult,
} from '../../util/connex/request-code';
import type { ConnexClient } from './types';

export async function create(
  client: Client,
  args: string[],
  flags: { '--name'?: string; '--format'?: string; '--json'?: boolean }
): Promise<number> {
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const serviceType = args[0];
  if (!serviceType) {
    output.error('Missing service type. Usage: vercel connex create <type>');
    return 1;
  }

  // Resolve team
  await selectConnexTeam(
    client,
    'Select the team where you want to create this client'
  );

  // Get app name from flag or interactive prompt
  let name = flags['--name'];
  if (!name) {
    if (!client.stdin.isTTY) {
      output.error(
        'Missing required flag --name. In non-interactive mode, provide --name for the client.'
      );
      return 1;
    }
    name = await client.input.text({
      message: `What would you like to name your ${serviceType} app?`,
      validate: (val: string) =>
        val.trim().length > 0 || 'Name cannot be empty',
    });
  }

  // Generate request code and attempt to create the managed client directly
  const { verifier, requestCode } = generateRequestCode();
  const link = await getProjectLink(client, client.cwd);

  const body: JSONObject = {
    service: serviceType,
    name,
    request_code: requestCode,
  };
  if (link?.projectId) {
    body.projectId = link.projectId;
  }

  output.spinner('Setting up...');
  let createdClient: ConnexClient | null = null;
  let browserUrl: string | undefined;
  try {
    createdClient = await client.fetch<ConnexClient>(
      '/v1/connex/clients/managed?autoinstall=true',
      { method: 'POST', body }
    );
  } catch (err: unknown) {
    const apiErr = err as { status?: number; registerUrl?: string };
    if (apiErr.status === 422 && apiErr.registerUrl) {
      browserUrl = apiErr.registerUrl;
    } else if (apiErr.status === 404) {
      output.stopSpinner();
      output.error(
        'Connex is not enabled for this team. Contact support to enable it.'
      );
      return 1;
    } else {
      output.stopSpinner();
      printError(err);
      return 1;
    }
  }
  output.stopSpinner();

  let hasBeenInstalled = false;
  if (browserUrl) {
    // Registration required — open browser and wait for user to complete setup
    output.log(`Opening browser for ${serviceType} app setup...`);
    output.log(`If the browser doesn't open, visit:\n${browserUrl}`);
    open(browserUrl).catch((err: unknown) =>
      output.debug(`Failed to open browser: ${err}`)
    );

    output.spinner('Waiting for you to complete setup in the browser...');
    const resultFromBrowser = await awaitConnexResult(client, verifier);
    output.stopSpinner();

    if (
      resultFromBrowser &&
      'clientId' in resultFromBrowser &&
      typeof resultFromBrowser.clientId === 'string'
    ) {
      const clientId = resultFromBrowser.clientId;
      createdClient = await client.fetch<ConnexClient>(
        `/v1/connex/clients/${clientId}`
      );
    }
    if (
      resultFromBrowser &&
      'installationId' in resultFromBrowser &&
      resultFromBrowser.installationId
    ) {
      hasBeenInstalled = true;
    }
  }

  if (!createdClient) {
    return 1;
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          id: createdClient.id,
          uid: createdClient.uid,
          type: createdClient.type,
          name: createdClient.name,
          supportedSubjectTypes: createdClient.supportedSubjectTypes,
        },
        null,
        2
      )}\n`
    );
  } else if (hasBeenInstalled) {
    output.success(
      `${serviceType} client created and installed: ${createdClient.id} (UID ${createdClient.uid})`
    );
  } else {
    output.success(
      `${serviceType} client created: ${createdClient.id} (UID ${createdClient.uid})`
    );
  }
  return 0;
}
