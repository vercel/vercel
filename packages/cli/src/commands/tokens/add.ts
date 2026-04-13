import open from 'open';
import ms from 'ms';
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
import { TokensAddTelemetryClient } from '../../util/telemetry/commands/tokens/add';

interface CreateTokenResponse {
  token?: { id?: string; name?: string };
  bearerToken?: string;
}

interface Permission {
  resource: string;
  action: string;
}

interface AuthorizationDetail {
  type: 'permissions';
  permissions: Permission[];
}

const VALID_ACTIONS = ['create', 'delete', 'read', 'update', 'list'] as const;

const MAX_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const COMMON_PERMISSIONS: Array<{
  name: string;
  value: string;
}> = [
  { name: 'project:read (Read project details)', value: 'project:read' },
  { name: 'project:list (List projects)', value: 'project:list' },
  {
    name: 'deployment:create (Create deployments)',
    value: 'deployment:create',
  },
  {
    name: 'deployment:read (Read deployment details)',
    value: 'deployment:read',
  },
  { name: 'deployment:list (List deployments)', value: 'deployment:list' },
  {
    name: 'projectEnvVars:read (Read environment variables)',
    value: 'projectEnvVars:read',
  },
  {
    name: 'projectEnvVars:create (Create environment variables)',
    value: 'projectEnvVars:create',
  },
  {
    name: 'projectEnvVars:update (Update environment variables)',
    value: 'projectEnvVars:update',
  },
  { name: 'domain:read (Read domain details)', value: 'domain:read' },
  { name: 'domain:list (List domains)', value: 'domain:list' },
];

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

function parsePermission(raw: string): Permission | string {
  const colonIndex = raw.indexOf(':');
  if (colonIndex === -1) {
    return `Invalid permission format "${raw}". Expected resource:action (e.g. project:read).`;
  }
  const resource = raw.slice(0, colonIndex);
  const action = raw.slice(colonIndex + 1);
  if (!resource) {
    return `Invalid permission format "${raw}". Resource cannot be empty.`;
  }
  if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
    return `Invalid action "${action}" in "${raw}". Valid actions: ${VALID_ACTIONS.join(', ')}.`;
  }
  return { resource, action };
}

function parseExpiry(raw: string): number | string {
  const duration = ms(raw);
  if (duration === undefined || duration <= 0) {
    return `Invalid expiry duration "${raw}". Use a duration like "7d", "1h", or "30m".`;
  }
  return duration;
}

async function promptPermissionsInteractive(
  client: Client
): Promise<{ permissions: Permission[]; expiresAt: number } | null> {
  const shouldScope = await client.input.confirm(
    'Scope this token to specific permissions?',
    false
  );
  if (!shouldScope) {
    return null;
  }

  const selected = await client.input.checkbox({
    message: 'Select permissions',
    choices: COMMON_PERMISSIONS.map(p => ({
      name: p.name,
      value: p.value,
      checked: false,
    })),
  });

  const additional = await client.input.text({
    message:
      'Enter additional permissions (comma-separated resource:action), or press Enter to skip:',
  });

  const permissions: Permission[] = [];
  for (const raw of selected) {
    const parsed = parsePermission(raw);
    if (typeof parsed === 'string') {
      output.error(parsed);
      return null;
    }
    permissions.push(parsed);
  }

  if (additional.trim()) {
    for (const raw of additional.split(',').map(s => s.trim())) {
      if (!raw) {
        continue;
      }
      const parsed = parsePermission(raw);
      if (typeof parsed === 'string') {
        output.error(parsed);
        return null;
      }
      permissions.push(parsed);
    }
  }

  if (permissions.length === 0) {
    output.error('No permissions selected. Cannot create a scoped token.');
    return null;
  }

  const expiryInput = await client.input.text({
    message: 'Token expiry (e.g. 7d, 1h, 30m):',
    validate: (value: string) => {
      const duration = ms(value);
      if (duration === undefined || duration <= 0) {
        return 'Invalid duration. Use a format like "7d", "1h", or "30m".';
      }
      if (duration > MAX_EXPIRY_MS) {
        return 'Expiry cannot exceed 7 days for scoped tokens.';
      }
      return true;
    },
  });

  const duration = ms(expiryInput);
  if (duration === undefined || duration <= 0) {
    output.error('Invalid expiry duration.');
    return null;
  }

  return { permissions, expiresAt: Date.now() + duration };
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

  const telemetryClient = new TokensAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

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

  const permissionFlags = parsedArgs.flags['--permission'];
  const expiryFlag = parsedArgs.flags['--expiry'];

  telemetryClient.trackCliOptionPermission(permissionFlags);
  telemetryClient.trackCliOptionExpiry(expiryFlag);

  let permissions: Permission[] = [];
  let expiresAt: number | undefined;
  let authorizationDetails: AuthorizationDetail[] | undefined;

  if (permissionFlags && permissionFlags.length > 0) {
    // Flag-based flow
    for (const raw of permissionFlags) {
      const parsed = parsePermission(raw);
      if (typeof parsed === 'string') {
        output.error(parsed);
        return 1;
      }
      permissions.push(parsed);
    }

    if (!expiryFlag) {
      output.error(
        '--expiry is required when --permission is used. Scoped tokens must have an expiry (max 7 days).'
      );
      return 1;
    }

    const duration = parseExpiry(expiryFlag);
    if (typeof duration === 'string') {
      output.error(duration);
      return 1;
    }

    if (duration > MAX_EXPIRY_MS) {
      output.error(
        'Expiry cannot exceed 7 days for scoped tokens. Use a duration of 7d or less.'
      );
      return 1;
    }

    expiresAt = Date.now() + duration;
  } else if (expiryFlag) {
    output.error(
      '--expiry can only be used with --permission. To create a token without permissions, omit both flags.'
    );
    return 1;
  } else if (client.stdin.isTTY) {
    // Interactive flow
    const interactive = await promptPermissionsInteractive(client);
    if (interactive) {
      permissions = interactive.permissions;
      expiresAt = interactive.expiresAt;
    }
  }

  if (permissions.length > 0 && expiresAt) {
    authorizationDetails = [{ type: 'permissions', permissions }];
  }

  const projectId = parsedArgs.flags['--project'];
  const body: {
    name: string;
    projectId?: string;
    authorizationDetails?: AuthorizationDetail[];
    expiresAt?: number;
  } = { name };
  if (typeof projectId === 'string' && projectId.length > 0) {
    body.projectId = projectId;
  }
  if (authorizationDetails) {
    body.authorizationDetails = authorizationDetails;
    body.expiresAt = expiresAt;
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
  if (permissions.length > 0) {
    output.log(
      `permissions: ${permissions.map(p => `${p.resource}:${p.action}`).join(', ')}`
    );
  }
  if (expiresAt) {
    output.log(`expires: ${new Date(expiresAt).toISOString()}`);
  }
  return 0;
}
