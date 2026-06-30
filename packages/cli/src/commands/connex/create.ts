import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { text } from 'node:stream/consumers';
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

interface ConnexServiceInfo {
  types?: Array<{
    type?: string;
    createInputSchema?: Record<string, unknown>;
  }>;
}

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
    '--data'?: string;
    '--connector-type'?: string;
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

  const dataFlag = flags['--data'];
  const connectorType = flags['--connector-type'];
  if (connectorType && dataFlag === undefined) {
    output.error('The --connector-type flag requires --data.');
    return 1;
  }

  const isNonManagedCreate = dataFlag !== undefined;

  // Resolve the --data source up front (inline JSON, `@<path>` to read a
  // file, or `@-` to read stdin) so credentials can be supplied without
  // leaking into shell history / process listings, and so we fail fast on a
  // bad source before team selection or any network call.
  let nonManagedData: JSONObject | undefined;
  let isDataFlagEmpty = false;
  if (dataFlag !== undefined) {
    try {
      const rawData = await resolveDataFlag(dataFlag, client);
      if (rawData.trim().length === 0) {
        isDataFlagEmpty = true;
      } else {
        nonManagedData = parseDataFlag(rawData);
        // Inline JSON (anything not read from a file or stdin) is exposed in
        // shell history and `ps`; nudge toward `@<path>`/`@-` when it looks
        // like it carries a secret.
        if (!dataFlag.startsWith('@')) {
          warnInlineSecret(nonManagedData);
        }
      }
    } catch (err) {
      output.error((err as Error).message);
      return 1;
    }
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

  if (isDataFlagEmpty) {
    return await outputMissingDataError(client, serviceType, connectorType);
  }

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

  const link = await getProjectLink(client, client.cwd);

  const body: JSONObject = {
    service: serviceType,
    name,
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

  let verifier: string | undefined;
  if (isNonManagedCreate) {
    try {
      const resolvedConnectorType =
        connectorType ??
        (await discoverConnectorType(client, serviceType)) ??
        'oauth';

      body.data = nonManagedData;
      body.type = resolvedConnectorType;

      createdClient = await client.fetch<ConnexClient>(
        '/v1/connect/connectors',
        { method: 'POST', body }
      );
    } catch (err: unknown) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 404) {
        output.stopSpinner();
        output.error(
          'Connect is not enabled for this team. Contact support to enable it.'
        );
        return 1;
      }
      output.stopSpinner();
      printError(err);
      return 1;
    }
  } else {
    // Generate request code and attempt to create the managed client directly.
    const request = generateRequestCode();
    verifier = request.verifier;
    body.request_code = request.requestCode;

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
  }
  output.stopSpinner();

  let hasBeenInstalled = false;
  let brandingPatchFailed = false;
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
    if (!verifier) {
      output.stopSpinner();
      output.error('Missing browser setup verifier.');
      return 1;
    }
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
          brandingPatchFailed = true;
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
  return brandingPatchFailed ? 1 : 0;
}

/**
 * Reads the entire stdin stream to EOF and returns it as a string. Used for
 * the explicit `--data @-` request, where the full credential payload must be
 * captured. Unlike `readStandardInput`, this has no time cap and accumulates
 * every chunk, so slow producers and multi-chunk payloads are read in full.
 * Returns '' when stdin is a TTY (nothing is piped, so reading would block).
 */
async function readStdinToEnd(stdin: Client['stdin']): Promise<string> {
  if (stdin.isTTY) {
    return '';
  }
  return text(stdin);
}

/**
 * Resolves a `--data` flag value to the raw JSON string. Supports inline
 * JSON, `@<path>` to read a file (relative paths resolved against `cwd`),
 * and `@-` to read from stdin. File/stdin sources keep secrets out of argv,
 * shell history, and process listings.
 */
async function resolveDataFlag(raw: string, client: Client): Promise<string> {
  if (!raw.startsWith('@')) {
    return raw;
  }
  const source = raw.slice(1);
  if (source === '-') {
    return readStdinToEnd(client.stdin);
  }
  if (source.length === 0) {
    throw new Error(
      'Invalid --data value. Use `@<path>` to read from a file or `@-` to read from stdin.'
    );
  }
  try {
    return await readFile(resolve(client.cwd, source), 'utf8');
  } catch (err) {
    throw new Error(
      `Could not read --data file at "${source}": ${(err as Error).message}`
    );
  }
}

const SECRET_KEY_PATTERN =
  /secret|password|passwd|token|api[-_]?key|private[-_]?key|credential/i;

/**
 * Warns when inline `--data` JSON contains a credential-looking key, since
 * inline flag values leak into shell history and `ps` output.
 */
function warnInlineSecret(data: JSONObject): void {
  const secretKey = Object.keys(data).find(key => SECRET_KEY_PATTERN.test(key));
  if (secretKey) {
    output.warn(
      `--data was passed inline and appears to contain a credential ("${secretKey}"). Inline flag values leak into shell history and process listings. Pass \`--data @<path>\` to read from a file or \`--data @-\` to read from stdin instead.`
    );
  }
}

function parseDataFlag(raw: string): JSONObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON for --data. Expected a JSON object.');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The --data value must be a JSON object.');
  }

  return parsed as JSONObject;
}

async function discoverConnectorType(
  client: Client,
  service: string
): Promise<string | undefined> {
  const serviceInfo = await fetchServiceInfo(client, service);
  return defaultConnectorType(serviceInfo);
}

async function outputMissingDataError(
  client: Client,
  service: string,
  inputConnectorType?: string
): Promise<number> {
  const { connectorType, createInputSchema } =
    await resolveMissingDataSchemaInfo(client, service, inputConnectorType);

  let message = '--data requires a non-empty JSON object.';
  if (createInputSchema) {
    message += `\n\nExpected --data schema for connector type "${connectorType}":\n${JSON.stringify(
      createInputSchema,
      null,
      2
    )}`;
  }

  output.error(message);
  return 1;
}

async function resolveMissingDataSchemaInfo(
  client: Client,
  service: string,
  inputConnectorType?: string
): Promise<{
  connectorType: string;
  createInputSchema?: Record<string, unknown>;
}> {
  let serviceInfo = await fetchServiceInfo(client, service);
  const connectorType =
    inputConnectorType ?? defaultConnectorType(serviceInfo) ?? 'oauth';

  if (!serviceInfo) {
    serviceInfo = await fetchServiceInfo(client, inputConnectorType || 'oauth');
  }

  return {
    connectorType,
    createInputSchema: createInputSchemaForType(serviceInfo, connectorType),
  };
}

async function fetchServiceInfo(
  client: Client,
  service: string
): Promise<ConnexServiceInfo | undefined> {
  try {
    return await client.fetch<ConnexServiceInfo>(
      `/v1/connect/services/${encodeURIComponent(service)}?schemas=true`
    );
  } catch (err) {
    const apiErr = err as { status?: number };
    if (apiErr.status === 404) {
      return undefined;
    }
    throw err;
  }
}

function defaultConnectorType(
  serviceInfo: ConnexServiceInfo | undefined
): string | undefined {
  const discoveredType = serviceInfo?.types?.[0]?.type;
  if (typeof discoveredType === 'string' && discoveredType.length > 0) {
    return discoveredType;
  }
}

function createInputSchemaForType(
  serviceInfo: ConnexServiceInfo | undefined,
  connectorType: string
): Record<string, unknown> | undefined {
  return serviceInfo?.types?.find(typeInfo => typeInfo.type === connectorType)
    ?.createInputSchema;
}
