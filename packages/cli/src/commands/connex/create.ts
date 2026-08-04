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
import {
  buildMethodGuidance,
  collectMethodCredentials,
  collectTemplateParams,
  ConnexMethodError,
  fetchConnexServiceInfo,
  parseConnexParams,
  resolveConnexConnectionMethod,
  type ConnexConnectionMethod,
  type ConnexMethodSelection,
  type ConnexServiceInfo,
} from '../../util/connex/connection-methods';
import type { ConnexClient } from './types';

export async function create(
  client: Client,
  args: string[],
  flags: {
    '--name'?: string;
    '--format'?: string;
    '--json'?: boolean;
    '--triggers'?: boolean;
    '--trigger-event'?: string[];
    '--icon'?: string;
    '--background-color'?: string;
    '--accent-color'?: string;
    '--data'?: string;
    '--connector-type'?: string;
    '--connection-method'?: string;
    '--target'?: string;
    '--param'?: string[];
    '--yes'?: boolean;
  }
): Promise<number> {
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const service = args[0];
  if (!service) {
    output.error('Missing service. Usage: vercel connect create <service>');
    return 1;
  }

  if (flags['--trigger-event'] && !flags['--triggers']) {
    output.error('The --trigger-event flag requires --triggers.');
    return 1;
  }

  const dataFlag = flags['--data'];
  const connectorType = flags['--connector-type'];
  const connectionMethodFlag = flags['--connection-method'];
  const targetFlag = flags['--target'];

  if (connectorType && dataFlag === undefined) {
    output.error('The --connector-type flag requires --data.');
    return 1;
  }
  if (connectorType && connectionMethodFlag) {
    output.error(
      'The --connector-type and --connection-method flags cannot be combined. The connection method decides the connector type.'
    );
    return 1;
  }

  const hasDataFlag = dataFlag !== undefined;
  const isDataOnlyCreate = hasDataFlag && !connectionMethodFlag;

  let suppliedParams: Record<string, string> = {};
  try {
    const parsed = parseConnexParams(flags['--param']);
    suppliedParams = parsed.params;
    for (const warning of parsed.warnings) {
      output.warn(warning);
    }
  } catch (err) {
    output.error((err as Error).message);
    return 1;
  }

  if (isDataOnlyCreate && Object.keys(suppliedParams).length > 0) {
    output.error('The --param flag requires --connection-method.');
    return 1;
  }
  if (isDataOnlyCreate && targetFlag) {
    output.error('The --target flag requires --connection-method.');
    return 1;
  }

  // Resolve the --data source up front (inline JSON, `@<path>` to read a
  // file, or `@-` to read stdin) so credentials can be supplied without
  // leaking into shell history / process listings, and so we fail fast on a
  // bad source before team selection or any network call.
  let suppliedData: JSONObject | undefined;
  let isDataFlagEmpty = false;
  if (dataFlag !== undefined) {
    try {
      const rawData = await resolveDataFlag(dataFlag, client);
      if (rawData.trim().length === 0) {
        isDataFlagEmpty = true;
      } else {
        suppliedData = parseDataFlag(rawData);
        // Inline JSON (anything not read from a file or stdin) is exposed in
        // shell history and `ps`; nudge toward `@<path>`/`@-` when it looks
        // like it carries a secret.
        if (!dataFlag.startsWith('@')) {
          warnInlineSecret(suppliedData);
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

  if (isDataFlagEmpty && isDataOnlyCreate) {
    return await outputMissingDataError(client, service, connectorType);
  }

  const interactive = Boolean(client.stdin.isTTY) && !client.nonInteractive;

  // Get app name from flag or interactive prompt
  let name = flags['--name'];
  if (!name) {
    if (!interactive) {
      output.error(
        'Missing required flag --name. In non-interactive mode, provide --name for the connector.'
      );
      return 1;
    }
    name = await client.input.text({
      message: `What would you like to name your ${service} app?`,
      validate: (val: string) =>
        val.trim().length > 0 || 'Name cannot be empty',
    });
  }

  // Resolve the connection method before any spinner, so the choosers own the
  // terminal. Skipped when the caller supplied the config themselves.
  let selection: ConnexMethodSelection | undefined;
  let serviceName = service;
  if (!isDataOnlyCreate) {
    let serviceInfo: ConnexServiceInfo | undefined;
    try {
      output.spinner('Loading connection methods…');
      serviceInfo = await fetchConnexServiceInfo(client, service);
    } catch (err) {
      if (connectionMethodFlag) {
        output.stopSpinner();
        printError(err);
        return 1;
      }
      // Discovery is additive here: a service the registry doesn't describe
      // still creates through the managed POST-first flow it always used.
      output.debug(
        `Failed to load connection methods: ${(err as Error).message}`
      );
    } finally {
      output.stopSpinner();
    }

    serviceName = serviceInfo?.name ?? service;
    const methods = serviceInfo?.connectionMethods ?? [];

    if (methods.length === 0) {
      // Nothing to resolve against, so every method-path flag is inert here.
      // Reject all of them: a silently dropped value looks like it took.
      const unusable = connectionMethodFlag
        ? '--connection-method'
        : targetFlag
          ? '--target'
          : Object.keys(suppliedParams).length > 0
            ? '--param'
            : undefined;
      if (unusable) {
        output.error(
          `"${service}" doesn't publish connection methods, so ${unusable} can't be used.`
        );
        return 1;
      }
    } else {
      try {
        selection = await resolveConnexConnectionMethod(client, {
          service: service,
          serviceName,
          methods,
          targets: serviceInfo?.targets,
          connectionMethodFlag,
          targetFlag,
          interactive,
          skipConfirm: flags['--yes'] === true,
        });
      } catch (err) {
        if (err instanceof ConnexMethodError) {
          output.error(err.message);
          return 1;
        }
        throw err;
      }
    }
  }

  // Managed wins when a method offers both paths; `--data` alongside
  // `--connection-method` is the explicit opt-out into BYO credentials.
  const useManagedMethodCreate =
    selection !== undefined &&
    selection.method.create.managed === true &&
    !hasDataFlag;
  const useManualMethodCreate =
    selection !== undefined && !useManagedMethodCreate;

  let methodParams: Record<string, string> = {};
  let methodData: Record<string, unknown> = {};
  if (useManualMethodCreate && selection) {
    try {
      const { method } = selection;
      methodParams = await collectTemplateParams(
        client,
        method,
        suppliedParams,
        interactive
      );
      methodData = await collectMethodCredentials(
        client,
        method,
        suppliedData,
        interactive,
        // Where to get credentials is only worth saying when we are about to
        // ask for them; `--data` can supply every one of them.
        () => printMethodGuidance(method, serviceName)
      );
    } catch (err) {
      if (err instanceof ConnexMethodError) {
        output.error(err.message);
        return 1;
      }
      throw err;
    }
  } else if (
    useManagedMethodCreate &&
    Object.keys(suppliedParams).length > 0 &&
    selection
  ) {
    output.error(
      `Connection method "${selection.method.connectionMethod}" is registered automatically and takes no --param values.`
    );
    return 1;
  }

  // Upload the prepared icon (if any) before creating the connector. The
  // file was already validated above; this only does the /v2/files POST.
  let iconSha: string | undefined;
  if (preparedIcon) {
    try {
      output.spinner('Uploading icon…');
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
    service: service,
    name,
  };
  if (link?.projectId) {
    body.projectId = link.projectId;
  }
  body.triggers = { enabled: flags['--triggers'] === true };
  if (flags['--trigger-event'] !== undefined) {
    body.events = flags['--trigger-event'];
  }
  if (iconSha) {
    body.icon = iconSha;
  }
  if (backgroundColor) {
    body.backgroundColor = backgroundColor;
  }
  if (accentColor) {
    body.accentColor = accentColor;
  }
  if (selection) {
    body.connectionMethod = selection.method.connectionMethod;
    if (selection.target !== undefined) {
      body.target = selection.target;
    }
  }

  output.spinner('Setting up…');
  let createdClient: ConnexClient | null = null;
  let browserUrl: string | undefined;

  let verifier: string | undefined;
  if (useManualMethodCreate) {
    // The registry owns endpoints and the connector type: the server derives
    // both from `connectionMethod`
    if (Object.keys(methodParams).length > 0) {
      body.params = methodParams;
    }
    // `data` is required by the create endpoint even when the method needs
    // no credentials of its own.
    body.data = methodData as JSONObject;

    try {
      createdClient = await client.fetch<ConnexClient>(
        '/v1/connect/connectors',
        { method: 'POST', body }
      );
    } catch (err: unknown) {
      output.stopSpinner();
      if ((err as { status?: number }).status === 404) {
        output.error(
          'Connect is not enabled for this team. Contact support to enable it.'
        );
        return 1;
      }
      printError(err);
      return 1;
    }
  } else if (isDataOnlyCreate) {
    try {
      const resolvedConnectorType =
        connectorType ??
        (await discoverConnectorType(client, service)) ??
        'oauth';

      body.data = suppliedData;
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

    output.log(`Opening browser for ${service} app setup…`);
    output.log(`If the browser doesn't open, visit:\n${finalBrowserUrl}`);
    open(finalBrowserUrl).catch((err: unknown) =>
      output.debug(`Failed to open browser: ${err}`)
    );

    output.spinner('Waiting for you to complete setup in the browser…');
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
          output.spinner('Applying branding…');
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
          service: createdClient.service ?? null,
          connectionMethod: createdClient.connectionMethod ?? null,
          target: createdClient.target ?? null,
        },
        null,
        2
      )}\n`
    );
  } else {
    const via = selection ? ` via ${selection.method.label}` : '';
    const created = hasBeenInstalled
      ? `${service} connector created and installed${via}`
      : `${service} connector created${via}`;
    output.success(
      `${created}: ${createdClient.id} (UID ${createdClient.uid})`
    );
  }
  return brandingPatchFailed ? 1 : 0;
}

/**
 * Prints the method's setup guidance as its own phase, so the credential
 * prompts that follow have the register link and redirect URI in view.
 */
function printMethodGuidance(
  method: ConnexConnectionMethod,
  serviceName: string
): void {
  const lines = buildMethodGuidance(method, serviceName);
  if (lines.length === 0) {
    return;
  }
  output.print('\n');
  for (const line of lines) {
    output.print(`  ${line}\n`);
  }
  output.print('\n');
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
  const serviceInfo = await fetchConnexServiceInfo(client, service);
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
  let serviceInfo = await fetchConnexServiceInfo(client, service);
  const connectorType =
    inputConnectorType ?? defaultConnectorType(serviceInfo) ?? 'oauth';

  if (!serviceInfo) {
    serviceInfo = await fetchConnexServiceInfo(
      client,
      inputConnectorType || 'oauth'
    );
  }

  return {
    connectorType,
    createInputSchema: createInputSchemaForType(serviceInfo, connectorType),
  };
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
