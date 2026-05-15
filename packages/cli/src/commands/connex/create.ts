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
import { validateHexColor } from '../../util/connex/validate-hex';
import {
  prepareConnexIcon,
  uploadConnexIcon,
  type PreparedIcon,
} from '../../util/connex/upload-icon';
import type { ConnexClient } from './types';

export async function create(
  client: Client,
  args: string[],
  flags: {
    '--name'?: string;
    '--format'?: string;
    '--json'?: boolean;
    '--triggers'?: boolean;
    '--icon'?: string;
    '--background-color'?: string;
    '--accent-color'?: string;
  }
): Promise<number> {
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const serviceType = args[0];
  if (!serviceType) {
    output.error('Missing service type. Usage: vercel connect create <type>');
    return 1;
  }

  // Preflight branding validation BEFORE team selection / network / upload.
  // This includes hex format, icon path readability, AND magic-byte check —
  // we don't want to mutate team config or prompt the user just to fail on
  // an unreadable or non-image icon afterwards.
  const iconFlag = flags['--icon'];
  const backgroundColor = flags['--background-color'];
  const accentColor = flags['--accent-color'];

  if (iconFlag !== undefined && iconFlag.length === 0) {
    output.error('Icon path cannot be empty.');
    return 1;
  }
  try {
    validateHexColor(backgroundColor, 'background color');
    validateHexColor(accentColor, 'accent color');
  } catch (err) {
    output.error((err as Error).message);
    return 1;
  }
  let preparedIcon: PreparedIcon | undefined;
  if (iconFlag) {
    try {
      preparedIcon = await prepareConnexIcon(iconFlag, client.cwd);
    } catch (err) {
      output.error((err as Error).message);
      return 1;
    }
  }

  // Resolve team
  await selectConnexTeam(
    client,
    'Select the team where you want to create this connector'
  );

  // Get app name from flag or interactive prompt
  let name = flags['--name'];
  if (!name) {
    if (!client.stdin.isTTY) {
      output.error(
        'Missing required flag --name. In non-interactive mode, provide --name for the connector.'
      );
      return 1;
    }
    name = await client.input.text({
      message: `What would you like to name your ${serviceType} app?`,
      validate: (val: string) =>
        val.trim().length > 0 || 'Name cannot be empty',
    });
  }

  // Upload the prepared icon (if any) before creating the connector. The
  // file was already validated above; this only does the /v2/files POST.
  let iconSha: string | undefined;
  if (preparedIcon) {
    try {
      output.spinner('Uploading icon...');
      iconSha = await uploadConnexIcon(client, preparedIcon);
    } catch (err) {
      output.stopSpinner();
      output.error((err as Error).message);
      return 1;
    }
    output.stopSpinner();
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
  body.triggers = { enabled: flags['--triggers'] === true };
  if (iconSha) {
    body.icon = iconSha;
  }
  if (backgroundColor) {
    body.backgroundColor = backgroundColor;
  }
  if (accentColor) {
    body.accentColor = accentColor;
  }

  output.spinner('Setting up...');
  let createdClient: ConnexClient | null = null;
  let browserUrl: string | undefined;
  try {
    createdClient = await client.fetch<ConnexClient>(
      '/v1/connect/connectors/managed?autoinstall=true',
      { method: 'POST', body }
    );
  } catch (err: unknown) {
    const apiErr = err as { status?: number; registerUrl?: string };
    if (apiErr.status === 422 && apiErr.registerUrl) {
      browserUrl = apiErr.registerUrl;
    } else if (apiErr.status === 404) {
      output.stopSpinner();
      output.error(
        'Connect is not enabled for this team. Contact support to enable it.'
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
    // Registration required — open browser and wait for user to complete setup.
    // Append branding (icon SHA + colors) as query params so the dashboard
    // registration form can prefill itself and create the upstream Slack/GitHub
    // app with branding from the start. The follow-up PATCH below stays in
    // place as a safety net for the dashboard rollout window.
    const urlWithBranding = new URL(browserUrl);
    if (iconSha) {
      urlWithBranding.searchParams.set('icon', iconSha);
    }
    if (backgroundColor) {
      urlWithBranding.searchParams.set('backgroundColor', backgroundColor);
    }
    if (accentColor) {
      urlWithBranding.searchParams.set('accentColor', accentColor);
    }
    const finalBrowserUrl = urlWithBranding.toString();

    output.log(`Opening browser for ${serviceType} app setup...`);
    output.log(`If the browser doesn't open, visit:\n${finalBrowserUrl}`);
    open(finalBrowserUrl).catch((err: unknown) =>
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
        `/v1/connect/connectors/${encodeURIComponent(clientId)}`
      );

      // The dashboard registration form does not consume icon/colors from the
      // URL, so branding never reaches the create call when the browser flow
      // is taken. Apply branding via a follow-up PATCH so `vc connect create
      // <type> --icon ... --background-color ...` works for all flows.
      const hasBranding = !!(iconSha || backgroundColor || accentColor);
      if (hasBranding) {
        const brandingBody: JSONObject = {};
        if (iconSha) {
          brandingBody.icon = iconSha;
        }
        if (backgroundColor) {
          brandingBody.backgroundColor = backgroundColor;
        }
        if (accentColor) {
          brandingBody.accentColor = accentColor;
        }
        try {
          output.spinner('Applying branding...');
          createdClient = await client.fetch<ConnexClient>(
            `/v1/connect/connectors/${encodeURIComponent(clientId)}`,
            { method: 'PATCH', body: brandingBody }
          );
        } catch (err) {
          output.stopSpinner();
          output.warn(
            `Failed to apply branding: ${(err as Error).message}. The connector was created but branding was not applied.`
          );
        }
        output.stopSpinner();
      }
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
          icon: createdClient.icon ?? null,
          backgroundColor: createdClient.backgroundColor ?? null,
          accentColor: createdClient.accentColor ?? null,
        },
        null,
        2
      )}\n`
    );
  } else if (hasBeenInstalled) {
    output.success(
      `${serviceType} connector created and installed: ${createdClient.id} (UID ${createdClient.uid})`
    );
  } else {
    output.success(
      `${serviceType} connector created: ${createdClient.id} (UID ${createdClient.uid})`
    );
  }
  return 0;
}
