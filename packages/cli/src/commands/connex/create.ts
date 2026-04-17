import open from 'open';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { printError } from '../../util/error';
import { getProjectLink } from '../../util/projects/link';
import { selectConnexTeam } from '../../util/connex/select-team';
import {
  generateRequestCode,
  awaitConnexResult,
} from '../../util/connex/request-code';

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

  // Generate request code and call the managed create redirect endpoint
  const { original, hash } = generateRequestCode();
  const link = await getProjectLink(client, client.cwd);

  output.spinner('Setting up...');
  let browserUrl: string;
  try {
    let url = `/v1/connex/clients/managed?service=${encodeURIComponent(serviceType)}&name=${encodeURIComponent(name)}&request_code=${encodeURIComponent(hash)}&autoinstall=true`;
    if (link?.projectId) {
      url += `&projectId=${encodeURIComponent(link.projectId)}`;
    }
    const res = await client.fetch(url, { json: false, redirect: 'manual' });

    const location = res.headers.get('location');
    if (!location) {
      output.stopSpinner();
      output.error('Unexpected response from API: no redirect URL');
      return 1;
    }
    browserUrl = location;
  } catch (err: unknown) {
    output.stopSpinner();
    const status = (err as { status?: number }).status;
    if (status === 404) {
      output.error(
        'Connex is not enabled for this team. Contact support to enable it.'
      );
      return 1;
    }
    printError(err);
    return 1;
  }
  output.stopSpinner();

  // Open browser
  output.log(`Opening browser for ${serviceType} app setup...`);
  output.log(`If the browser doesn't open, visit:\n${browserUrl}`);
  open(browserUrl).catch((err: unknown) =>
    output.debug(`Failed to open browser: ${err}`)
  );

  // Poll for result
  output.spinner('Waiting for you to complete setup in the browser...');
  const data = await awaitConnexResult(client, original);
  output.stopSpinner();

  if (!data) {
    return 1;
  }

  const clientId = data.clientId as string;
  if (asJson) {
    client.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else if (data.installationId) {
    output.success(`${serviceType} client created and installed: ${clientId}`);
  } else {
    output.success(`${serviceType} client created: ${clientId}`);
  }
  return 0;
}
