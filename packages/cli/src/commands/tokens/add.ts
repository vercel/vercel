import open from 'open';
import { KNOWN_AGENTS } from '@vercel/detect-agent';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { addSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import {
  openUrlInBrowserCommand,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { getCommandNamePlain } from '../../util/pkg-name';

interface CreateTokenResponse {
  token?: { id?: string; name?: string };
  bearerToken?: string;
}

const VERCEL_ACCOUNT_TOKENS_URL = 'https://vercel.com/account/tokens';

const CLASSIC_TOKEN_GUIDANCE = `Creating a new token requires a classic personal access token. Sessions from "vercel login" use OAuth and cannot call the create-token API.

What to do:
  • Open the dashboard and create a classic token: Account → Settings → Tokens (${VERCEL_ACCOUNT_TOKENS_URL})
  • Authenticate the CLI with that token: set VERCEL_TOKEN to the token value, or use --token <token>
  • Run this command again with the same arguments.`;

const CLASSIC_TOKEN_AGENT_HINT = `The Vercel API only allows creating personal tokens when the CLI is authenticated with a classic personal access token (dashboard: Account → Settings → Tokens). OAuth login cannot mint new tokens. After creating a classic token, set VERCEL_TOKEN or pass --token, then re-run the same command.`;

const USER_SCOPE_GUIDANCE = `Your token is classic but does not include full user (account) scope, so the API cannot create a new personal token.

Common cases:
  • Team-only, project-only, or limited product tokens (for example some "vcp_" tokens) cannot mint new tokens.
  • Create a new classic token in the dashboard (Account → Settings → Tokens) with access to your personal account / full token permissions.
  • Then set VERCEL_TOKEN or use --token with that value and run this command again.`;

const USER_SCOPE_AGENT_HINT = `Creating a personal token requires a classic token that includes full user account scope. Team-scoped, project-scoped, or narrow product tokens are rejected with HTTP 403. Create a classic personal access token at ${VERCEL_ACCOUNT_TOKENS_URL} with account-level access, set VERCEL_TOKEN or --token, then re-run.`;

function normalizeApiMessage(message: string): string {
  return message.replace(/\s*\(\d{3}\)\s*$/, '').trim();
}

function isClassicTokenRequiredForCreateError(err: unknown): boolean {
  if (!isAPIError(err) || err.status !== 403) {
    return false;
  }
  const raw = err.serverMessage || err.message;
  return (
    normalizeApiMessage(raw) ===
    'Only user authentication tokens can be used to create new tokens.'
  );
}

function isTokenUserScopeRequiredError(err: unknown): boolean {
  if (!isAPIError(err) || err.status !== 403) {
    return false;
  }
  const raw = normalizeApiMessage(err.serverMessage || err.message);
  return raw.startsWith(
    'To create a token you must be authenticated to scope "'
  );
}

function tokensAddRecoveryNext(
  client: Client,
  rerun: string,
  rerunWhen: string
): Array<{ command: string; when?: string }> {
  return [
    {
      command: openUrlInBrowserCommand(VERCEL_ACCOUNT_TOKENS_URL),
      when: 'Open the Vercel dashboard to create a classic personal access token',
    },
    {
      command: `export VERCEL_TOKEN='<class_access_token>'`,
      when: 'Paste your classic token from the dashboard (replace <class_access_token>); on Windows use set VERCEL_TOKEN=<class_access_token> in cmd or $env:VERCEL_TOKEN in PowerShell',
    },
    {
      command: rerun,
      when: rerunWhen,
    },
  ];
}

async function openTokensDashboardInBrowser(client: Client): Promise<void> {
  const isCursorAgent =
    client.agentName === KNOWN_AGENTS.CURSOR ||
    client.agentName === KNOWN_AGENTS.CURSOR_CLI;
  const shouldSkipBrowser = Boolean(process.env.CI) && !isCursorAgent;
  if (shouldSkipBrowser) {
    return;
  }
  try {
    const p = await open(VERCEL_ACCOUNT_TOKENS_URL);
    p?.on?.('error', () => {});
  } catch {
    // Browser open is best-effort; user can follow the printed URL.
  }
}

export default async function add(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const { args } = parsedArgs;
  const name = args[0]?.trim();
  if (!name) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_arguments',
          message:
            'Token name is required. Example: `vercel tokens add "My token"`',
        },
        1
      );
    }
    output.error(
      'Token name is required. Example: `vercel tokens add "My token"`'
    );
    return 1;
  }
  if (args.length > 1) {
    output.error('Too many arguments. Pass a single token name.');
    return 1;
  }

  const validation = validateJsonOutput(parsedArgs.flags);
  if (!validation.valid) {
    output.error(validation.error);
    return 1;
  }
  const asJson = validation.jsonOutput;

  const projectId = parsedArgs.flags['--project'];
  const body: { name: string; projectId?: string } = { name };
  if (typeof projectId === 'string' && projectId.length > 0) {
    body.projectId = projectId;
  }

  let result: CreateTokenResponse;
  try {
    result = await client.fetch<CreateTokenResponse>('/v3/user/tokens', {
      method: 'POST',
      body,
      useCurrentTeam: false,
    });
  } catch (err: unknown) {
    if (isClassicTokenRequiredForCreateError(err)) {
      await openTokensDashboardInBrowser(client);
      const rerun = getCommandNamePlain(client.argv.slice(2).join(' ').trim());
      if (shouldEmitNonInteractiveCommandError(client)) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: AGENT_REASON.CLASSIC_TOKEN_REQUIRED,
            message:
              'Creating tokens requires a classic personal access token; OAuth login cannot create new tokens.',
            userActionRequired: true,
            verification_uri: VERCEL_ACCOUNT_TOKENS_URL,
            hint: CLASSIC_TOKEN_AGENT_HINT,
            next: tokensAddRecoveryNext(
              client,
              rerun,
              'Re-run after the token is set (or use --token <class_access_token> instead of export)'
            ),
          },
          1
        );
      }
      output.error(CLASSIC_TOKEN_GUIDANCE);
      return 1;
    }
    if (isTokenUserScopeRequiredError(err)) {
      await openTokensDashboardInBrowser(client);
      const rerun = getCommandNamePlain(client.argv.slice(2).join(' ').trim());
      const apiMessage = normalizeApiMessage(
        isAPIError(err) ? err.serverMessage || err.message : String(err)
      );
      if (shouldEmitNonInteractiveCommandError(client)) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: AGENT_REASON.TOKEN_USER_SCOPE_REQUIRED,
            message: apiMessage,
            userActionRequired: true,
            verification_uri: VERCEL_ACCOUNT_TOKENS_URL,
            hint: USER_SCOPE_AGENT_HINT,
            next: tokensAddRecoveryNext(
              client,
              rerun,
              'Re-run with a classic token that has full user account scope (or pass --token <class_access_token>)'
            ),
          },
          1
        );
      }
      output.error(USER_SCOPE_GUIDANCE);
      output.error('');
      output.error(apiMessage);
      return 1;
    }
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  output.success(
    'Token created. Save the value below — it will not be shown again.'
  );
  if (result.bearerToken) {
    output.log(result.bearerToken);
  }
  if (result.token?.id) {
    output.log(`id: ${result.token.id}`);
  }
  return 0;
}
