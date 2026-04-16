import open from 'open';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { selectConnexTeam } from '../../util/connex/select-team';
import {
  generateRequestCode,
  awaitConnexResult,
} from '../../util/connex/request-code';

interface ConnexTokenResponse {
  token: string;
  expiresAt: number;
  name?: string;
  installationId?: string;
  tenantId?: string;
  externalSubject?: string;
  data?: Record<string, unknown>;
}

interface AutoInstallResponse {
  action: string;
  url: string;
}

function isAutoInstallResponse(body: unknown): body is AutoInstallResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'action' in body &&
    'url' in body &&
    typeof (body as AutoInstallResponse).url === 'string'
  );
}

export async function token(
  client: Client,
  args: string[],
  flags: {
    '--subject'?: string;
    '--installation-id'?: string;
    '--scopes'?: string;
    '--format'?: string;
    '--json'?: boolean;
    '--yes'?: boolean;
  }
): Promise<number> {
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const clientId = args[0];
  if (!clientId) {
    output.error('Missing client ID. Usage: vercel connex token <clientId>');
    return 1;
  }

  const subject = flags['--subject'];
  if (subject && subject !== 'app' && subject !== 'user') {
    output.error('Invalid --subject value. Must be "app" or "user".');
    return 1;
  }

  // Resolve team
  await selectConnexTeam(client, 'Select the team for this token request');

  // Build token request body
  const body: Record<string, unknown> = {};
  if (subject) {
    body.subject = subject === 'app' ? { type: 'app' } : { type: 'user' };
  }
  if (flags['--installation-id']) {
    body.installationId = flags['--installation-id'];
  }
  if (flags['--scopes']) {
    body.scopes = flags['--scopes'].split(',').map(s => s.trim());
  }

  // Attempt 1: simple token request
  output.spinner('Fetching token...');
  const result = await fetchToken(client, clientId, body);
  output.stopSpinner();

  if (result.ok) {
    return printTokenResult(client, result.data, asJson);
  }

  // Check if auto-install/authorize is possible
  const errorCode = result.errorCode;
  if (errorCode === 'not_found') {
    output.error('Client not found or Connex is not enabled for this team.');
    return 1;
  }
  if (
    errorCode !== 'no_valid_token' &&
    errorCode !== 'client_installation_required'
  ) {
    output.error(result.errorMessage ?? 'Failed to get token');
    return 1;
  }

  // Auto-install/authorize requires TTY
  if (!client.stdin.isTTY) {
    const action = errorCode === 'no_valid_token' ? 'authorize' : 'install';
    output.error(
      `${result.errorMessage}. Run \`vercel connex token ${clientId}\` interactively to ${action}.`
    );
    return 1;
  }

  // Prompt user before opening browser (unless --yes)
  const actionLabel =
    errorCode === 'no_valid_token' ? 'Authorization' : 'Installation';

  if (!flags['--yes']) {
    const confirmed = await client.input.confirm(
      `${actionLabel} required. Open browser to continue?`,
      true
    );
    if (!confirmed) {
      output.log('Aborted.');
      return 0;
    }
  }

  // Attempt 2: request with autoinstall + request_code
  const { original, hash } = generateRequestCode();

  output.spinner('Setting up...');
  const autoResult = await fetchTokenAutoInstall(client, clientId, body, hash);
  output.stopSpinner();

  if (!autoResult.ok) {
    output.error(autoResult.errorMessage ?? 'Failed to initiate setup');
    return 1;
  }

  // If the API returned a token directly (no action needed), we're done
  if (autoResult.token) {
    return printTokenResult(client, autoResult.token, asJson);
  }

  // Open browser for the action
  if (!autoResult.url) {
    output.error('Unexpected response: no action URL returned');
    return 1;
  }

  output.log(`Opening browser for ${actionLabel.toLowerCase()}...`);
  output.log(`If the browser doesn't open, visit:\n${autoResult.url}`);
  open(autoResult.url).catch((err: unknown) =>
    output.debug(`Failed to open browser: ${err}`)
  );

  // Poll for result
  output.spinner(
    `Waiting for you to complete ${actionLabel.toLowerCase()} in the browser...`
  );
  const pollData = await awaitConnexResult(client, original);
  output.stopSpinner();

  if (!pollData) {
    return 1;
  }

  // Retry token request with any returned installationId
  const retryBody = { ...body };
  if (pollData.installationId) {
    retryBody.installationId = pollData.installationId as string;
  }

  output.spinner('Fetching token...');
  const retryResult = await fetchToken(client, clientId, retryBody);
  output.stopSpinner();

  if (retryResult.ok) {
    return printTokenResult(client, retryResult.data, asJson);
  }

  output.error(retryResult.errorMessage ?? 'Failed to get token after setup');
  return 1;
}

function printTokenResult(
  client: Client,
  data: ConnexTokenResponse,
  asJson: boolean
): number {
  if (asJson) {
    client.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    // Plain output: just the token value (pipeable)
    client.stdout.write(`${data.token}\n`);
  }
  return 0;
}

type TokenResult =
  | { ok: true; data: ConnexTokenResponse }
  | { ok: false; errorCode?: string; errorMessage?: string };

async function fetchToken(
  client: Client,
  clientId: string,
  body: Record<string, unknown>
): Promise<TokenResult> {
  try {
    const data = await client.fetch<ConnexTokenResponse>(
      `/v1/connex/token/${encodeURIComponent(clientId)}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }
    );
    return { ok: true, data };
  } catch (err: unknown) {
    const serverError = extractApiError(err);
    return {
      ok: false,
      errorCode: serverError.code,
      errorMessage: serverError.message,
    };
  }
}

type AutoInstallResult =
  | { ok: true; token?: ConnexTokenResponse; url?: string }
  | { ok: false; errorMessage?: string };

async function fetchTokenAutoInstall(
  client: Client,
  clientId: string,
  body: Record<string, unknown>,
  requestCodeHash: string
): Promise<AutoInstallResult> {
  try {
    const res = await client.fetch<ConnexTokenResponse | AutoInstallResponse>(
      `/v1/connex/token/${encodeURIComponent(clientId)}?autoinstall=true&request_code=${encodeURIComponent(requestCodeHash)}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (isAutoInstallResponse(res)) {
      return { ok: true, url: res.url };
    }

    // API returned a token directly
    return { ok: true, token: res as ConnexTokenResponse };
  } catch (err: unknown) {
    const serverError = extractApiError(err);
    return { ok: false, errorMessage: serverError.message };
  }
}

function extractApiError(err: unknown): {
  code?: string;
  message?: string;
} {
  if (typeof err === 'object' && err !== null) {
    const errObj = err as Record<string, unknown>;
    // client.fetch wraps API errors with serverMessage and code
    const code = typeof errObj.code === 'string' ? errObj.code : undefined;
    const message =
      typeof errObj.serverMessage === 'string'
        ? errObj.serverMessage
        : typeof errObj.message === 'string'
          ? errObj.message
          : 'Unknown error';
    return { code, message };
  }
  return { message: 'Unknown error' };
}
