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

type ActionableErrorCode =
  | 'user_authorization_required'
  | 'client_installation_required';

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

  await selectConnexTeam(client, 'Select the team for this token request');

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

  output.spinner('Fetching token...');
  const result = await fetchToken(client, clientId, body);
  output.stopSpinner();

  if (result.ok) {
    return printTokenResult(client, result.data, asJson);
  }

  const errorCode = result.errorCode;
  const errorMessage = result.errorMessage ?? 'Failed to get token';

  if (errorCode === 'not_found') {
    output.error('Client not found or Connex is not enabled for this team.');
    return 1;
  }

  if (errorCode === 'no_token') {
    output.error(
      `${errorMessage} This client does not support getting a token for the requested subject.`
    );
    return 1;
  }

  if (!isActionable(errorCode)) {
    output.error(errorMessage);
    return 1;
  }

  const teamId = client.config.currentTeam;
  if (!teamId) {
    output.error(
      `${errorMessage} Unable to build recovery URL: no team resolved.`
    );
    return 1;
  }

  const actionLabel =
    errorCode === 'user_authorization_required'
      ? 'authorization'
      : 'installation';

  // Non-TTY: print URL and exit — can't open a browser interactively in CI
  if (!client.stdin.isTTY) {
    const { hash } = generateRequestCode();
    const actionUrl = buildActionUrl(errorCode, clientId, teamId, hash);
    output.error(errorMessage);
    output.log(`To ${actionLabel}, open: ${actionUrl}`);
    output.log(
      `Or run \`vercel connex token ${clientId}\` in an interactive terminal.`
    );
    return 1;
  }

  // TTY: show error, prompt to open browser (Enter = yes)
  output.error(errorMessage);
  if (!flags['--yes']) {
    const confirmed = await client.input.confirm(
      `Open browser to ${actionLabel}?`,
      true
    );
    if (!confirmed) {
      return 0;
    }
  }

  const { original, hash } = generateRequestCode();
  const actionUrl = buildActionUrl(errorCode, clientId, teamId, hash);

  output.log(`Opening browser for ${actionLabel}...`);
  output.log(`If the browser doesn't open, visit:\n${actionUrl}`);
  open(actionUrl).catch((err: unknown) =>
    output.debug(`Failed to open browser: ${err}`)
  );

  output.spinner(`Waiting for ${actionLabel} to complete in the browser...`);
  const pollData = await awaitConnexResult(client, original);
  output.stopSpinner();

  if (!pollData) {
    return 1;
  }

  // Carry forward installationId if returned by the install flow
  const retryBody = { ...body };
  if (pollData.installationId && !retryBody.installationId) {
    retryBody.installationId = pollData.installationId as string;
  }

  output.spinner('Fetching token...');
  const retryResult = await fetchToken(client, clientId, retryBody);
  output.stopSpinner();

  if (retryResult.ok) {
    return printTokenResult(client, retryResult.data, asJson);
  }

  output.error(
    retryResult.errorMessage ?? `Failed to get token after ${actionLabel}`
  );
  return 1;
}

function isActionable(code: string | undefined): code is ActionableErrorCode {
  return (
    code === 'user_authorization_required' ||
    code === 'client_installation_required'
  );
}

function buildActionUrl(
  code: ActionableErrorCode,
  clientId: string,
  teamId: string,
  requestCodeHash: string
): string {
  const path = code === 'user_authorization_required' ? 'authorize' : 'install';
  const params = new URLSearchParams({
    teamId,
    request_code: requestCodeHash,
  });
  return `https://vercel.com/api/v1/connex/${path}/${encodeURIComponent(clientId)}?${params.toString()}`;
}

function printTokenResult(
  client: Client,
  data: ConnexTokenResponse,
  asJson: boolean
): number {
  if (asJson) {
    client.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
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

function extractApiError(err: unknown): {
  code?: string;
  message?: string;
} {
  if (typeof err === 'object' && err !== null) {
    const errObj = err as Record<string, unknown>;
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
