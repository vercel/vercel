import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import getScope from '../../util/get-scope';
import {
  dismissSubcommand,
  installSubcommand,
  listRequestsSubcommand,
  oauthAppsCommand,
  registerSubcommand,
  removeSubcommand,
} from './command';
import { validateJsonOutput } from '../../util/output-format';
import {
  buildCommandWithGlobalFlags,
  getGlobalFlagsFromArgv,
  outputActionRequired,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { isAPIError } from '../../util/errors-ts';
import { packageName } from '../../util/pkg-name';

const COMMAND_CONFIG = {
  listRequests: getCommandAliases(listRequestsSubcommand),
  register: getCommandAliases(registerSubcommand),
  dismiss: getCommandAliases(dismissSubcommand),
  install: getCommandAliases(installSubcommand),
  remove: getCommandAliases(removeSubcommand),
};

/** Internal keys returned by `getSubcommand` for `COMMAND_CONFIG` (defensive guard). */
const KNOWN_OAUTH_APPS_SUBCOMMANDS = new Set([
  'listRequests',
  'register',
  'dismiss',
  'install',
  'remove',
]);

type RegisteredOauthApp = {
  clientId: string;
  name: string;
  slug: string;
  redirectUris?: string[];
  description?: string;
};

type InstallationRequest = {
  app: {
    id: string;
    name: string;
    verified?: boolean;
    firstParty?: boolean;
  };
  requester: { id: string; name: string };
};

/**
 * Suggested `vercel [globals] <tail>` preserving global flags from the full argv
 * (`--cwd`, `--non-interactive`, `--scope`, etc.) wherever they appear—unlike
 * scanning only tokens before `oauth-apps`, which drops globals passed after the subcommand.
 */
function suggestVercelCommand(client: Client, commandTail: string): string {
  const globals = getGlobalFlagsFromArgv(client.argv);
  if (globals.length === 0) {
    return `${packageName} ${commandTail}`;
  }
  return `${packageName} ${globals.join(' ')} ${commandTail}`;
}

/** Suggested commands: global flags from argv, then `oauth-apps ...`. */
function suggestOauthAppsCommand(
  client: Client,
  oauthAppsTail: string
): string {
  return suggestVercelCommand(client, `oauth-apps ${oauthAppsTail}`);
}

/**
 * Quote a value for suggested shell `next.command` strings: use single quotes so
 * JSON output stays copy-pasteable (no JSON-escaped `\"`). Falls back to
 * double-quoted escaping only if the value contains `'`.
 */
function shellSingleQuoteArg(value: string): string {
  if (value === '') {
    return `''`;
  }
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
    .replace(/\r?\n/g, '\\n')}"`;
}

const OPTION_REQUIRES_ARGUMENT_RE = /^option requires argument:\s*(\S+)/i;

/** Best-effort parse of register args before `arg` succeeds (for suggested commands). */
type RegisterFlagSnapshot = {
  name?: string;
  slug?: string;
  description?: string;
  redirectUris: string[];
  /** Preserve `--format json` / `--json` in suggested retry command. */
  outputFormatJson?: boolean;
};

function snapshotRegisterFlagsFromArgs(
  registerArgs: string[]
): RegisterFlagSnapshot {
  const redirectUris: string[] = [];
  let name: string | undefined;
  let slug: string | undefined;
  let description: string | undefined;
  let outputFormatJson: boolean | undefined;

  for (let i = 0; i < registerArgs.length; i++) {
    const a = registerArgs[i];
    if (a === '--name') {
      const v = registerArgs[i + 1];
      if (v !== undefined && !v.startsWith('-')) {
        name = v;
        i++;
      }
    } else if (a.startsWith('--name=')) {
      name = a.slice('--name='.length);
    } else if (a === '--slug') {
      const v = registerArgs[i + 1];
      if (v !== undefined && !v.startsWith('-')) {
        slug = v;
        i++;
      }
    } else if (a.startsWith('--slug=')) {
      slug = a.slice('--slug='.length);
    } else if (a === '--description') {
      const v = registerArgs[i + 1];
      if (v !== undefined && !v.startsWith('-')) {
        description = v;
        i++;
      }
    } else if (a.startsWith('--description=')) {
      description = a.slice('--description='.length);
    } else if (a === '--redirect-uri') {
      const v = registerArgs[i + 1];
      if (v !== undefined && !v.startsWith('-')) {
        redirectUris.push(v);
        i++;
      }
    } else if (a.startsWith('--redirect-uri=')) {
      redirectUris.push(a.slice('--redirect-uri='.length));
    } else if (a === '--json') {
      outputFormatJson = true;
    } else if (a === '--format') {
      const v = registerArgs[i + 1];
      if (v !== undefined && v.toLowerCase() === 'json') {
        outputFormatJson = true;
        i++;
      }
    } else if (a.startsWith('--format=')) {
      const v = a.slice('--format='.length);
      if (v.toLowerCase() === 'json') {
        outputFormatJson = true;
      }
    }
  }

  return { name, slug, description, redirectUris, outputFormatJson };
}

function buildRegisterCommandTailForSuggestion(
  s: RegisterFlagSnapshot
): string {
  const parts: string[] = ['register'];
  parts.push(
    s.name !== undefined
      ? `--name ${shellSingleQuoteArg(s.name)}`
      : '--name <display-name>'
  );
  parts.push(
    s.slug !== undefined
      ? `--slug ${shellSingleQuoteArg(s.slug)}`
      : '--slug <slug>'
  );
  if (s.description !== undefined) {
    parts.push(`--description ${shellSingleQuoteArg(s.description)}`);
  }
  for (const u of s.redirectUris) {
    parts.push(`--redirect-uri ${shellSingleQuoteArg(u)}`);
  }
  if (s.outputFormatJson) {
    parts.push('--format json');
  }
  return parts.join(' ');
}

function registerOptionErrorWhenLine(
  snap: RegisterFlagSnapshot,
  erroredFlag: string
): string {
  const needName = snap.name === undefined;
  const needSlug = snap.slug === undefined;
  if (!needName && needSlug && erroredFlag === '--slug') {
    return 'Substitute <slug> only; `--name` was copied from your command. Keep the slug value immediately after `--slug`, before globals like `--cwd`.';
  }
  if (needName && needSlug) {
    return 'Replace <display-name> and <slug>; keep the slug immediately after `--slug` when adding more flags.';
  }
  if (needSlug) {
    return 'Replace <slug>; keep the slug immediately after `--slug` when adding more flags.';
  }
  if (needName) {
    return 'Replace <display-name>.';
  }
  return 'Fix flag values and retry.';
}

/**
 * `arg` throws before we see empty `--slug` as "missing slug"; e.g. `--slug --cwd=...`
 * makes the next token start with `--`, so the slug value is absent. Emit agent JSON.
 */
function tryEmitRegisterOptionRequiresArgumentError(
  client: Client,
  err: unknown,
  registerArgs: string[]
): boolean {
  if (!shouldEmitNonInteractiveCommandError(client)) {
    return false;
  }
  if (
    !(err instanceof Error) ||
    !OPTION_REQUIRES_ARGUMENT_RE.test(err.message)
  ) {
    return false;
  }
  const flag = err.message.match(OPTION_REQUIRES_ARGUMENT_RE)?.[1] ?? 'option';

  const snap = snapshotRegisterFlagsFromArgs(registerArgs);
  const tail = buildRegisterCommandTailForSuggestion(snap);

  const isSlug = flag === '--slug';
  const message = isSlug
    ? 'Missing value for `--slug`: the next token starts with `--`, so it was not treated as the slug.'
    : `\`${flag}\` requires a value before the next \`--\` flag.`;

  const hint = isSlug
    ? `Put the slug immediately after \`--slug\`, before globals like \`--cwd\`. Example: \`${packageName} oauth-apps register --name <display-name> --slug <slug> --cwd <path> --non-interactive\`. The slug is a URL-safe id you choose (lowercase letters, numbers, hyphens).`
    : `Reorder or quote values so each flag is followed by its argument. Example: \`${packageName} oauth-apps register --name <display-name> --slug <slug>\`.`;

  outputAgentError(
    client,
    {
      status: 'error',
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
      hint,
      next: [
        {
          command: suggestOauthAppsCommand(client, tail),
          when: registerOptionErrorWhenLine(snap, flag),
        },
      ],
    },
    1
  );
  output.error(message);
  return true;
}

/** API failures: JSON on stdout for `--non-interactive` (via outputAgentError) or `--format json`. */
function emitOauthAppsApiError(
  client: Client,
  message: string,
  jsonOutputFlag: boolean
): number {
  const payload = {
    status: 'error' as const,
    reason: AGENT_REASON.API_ERROR,
    message,
  };
  if (shouldEmitNonInteractiveCommandError(client)) {
    outputAgentError(client, payload, 1);
    return 1;
  }
  if (jsonOutputFlag) {
    client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return 1;
  }
  output.error(message);
  return 1;
}

/**
 * OAuth app APIs are team-scoped. Ensures `client.config.currentTeam` is set from scope.
 */
async function ensureTeamScopeForOauthAppsApi(
  client: Client,
  registerContext?: { name: string; slug: string }
): Promise<boolean> {
  const { team } = await getScope(client);
  if (team) {
    client.config.currentTeam = team.id;
    return true;
  }

  if (registerContext) {
    const { name, slug } = registerContext;
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_SCOPE,
        message:
          'Registering a Vercel App requires a team. Switch scope with `vercel teams switch` or pass `--scope <team>`.',
        hint: 'OAuth apps are owned by a team; personal (user-only) scope cannot create them.',
        next: [
          {
            command: suggestVercelCommand(client, 'teams switch'),
            when: 'Pick the team that will own the app',
          },
          {
            command: suggestOauthAppsCommand(
              client,
              `register --name ${shellSingleQuoteArg(name)} --slug ${shellSingleQuoteArg(slug)}`
            ),
            when: 'Retry register after selecting a team',
          },
        ],
      },
      1
    );
    output.error(
      'Registering a Vercel App requires a team. Use `vercel teams switch` or `--scope <team>`.'
    );
    return false;
  }

  outputAgentError(
    client,
    {
      status: 'error',
      reason: AGENT_REASON.MISSING_SCOPE,
      message:
        'OAuth app commands require a team. Switch scope with `vercel teams switch` or pass `--scope <team>`.',
      hint: 'Installations and requests are scoped to a team; personal (user-only) scope cannot use these APIs.',
      next: [
        {
          command: suggestVercelCommand(client, 'teams switch'),
          when: 'Pick the team for OAuth app actions',
        },
        {
          command: suggestOauthAppsCommand(client, 'list-requests'),
          when: 'List pending installation requests after selecting a team',
        },
      ],
    },
    1
  );
  output.error(
    'OAuth app commands require a team. Use `vercel teams switch` or `--scope <team>`.'
  );
  return false;
}

export default async function main(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(oauthAppsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const { subcommand, args } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    output.print(help(oauthAppsCommand, { columns: client.stderr.columns }));
    return 0;
  }

  if (subcommand === undefined && args.length > 0 && !args[0].startsWith('-')) {
    output.error(
      `Invalid oauth-apps subcommand "${args[0]}". Use: dismiss | install | list-requests | register | remove`
    );
    return 1;
  }

  if (
    typeof subcommand === 'string' &&
    !KNOWN_OAUTH_APPS_SUBCOMMANDS.has(subcommand)
  ) {
    output.error(
      `Invalid oauth-apps subcommand "${subcommand}". Use: dismiss | install | list-requests | register | remove`
    );
    return 1;
  }

  function printHelp(command: Command): number {
    output.print(
      help(command, {
        parent: oauthAppsCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  switch (subcommand) {
    case 'dismiss': {
      if (needHelp) {
        return printHelp(dismissSubcommand);
      }
      if (!(await ensureTeamScopeForOauthAppsApi(client))) {
        return 1;
      }
      const spec = getFlagsSpecification(dismissSubcommand.options);
      let p;
      try {
        p = parseArguments(args, spec);
      } catch (e) {
        printError(e);
        return 1;
      }
      const appId = p.args[0];
      const fr = validateJsonOutput(p.flags as { '--format'?: string });
      if (!fr.valid) {
        output.error(fr.error);
        return 1;
      }
      if (!appId) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: AGENT_REASON.MISSING_ARGUMENTS,
            message:
              'Missing app client id. Usage: `vercel oauth-apps dismiss <appId>`',
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'oauth-apps dismiss <appId> --yes'
                ),
                when: 'Dismiss an installation request',
              },
            ],
          },
          1
        );
        output.error('Missing app client id.');
        return 1;
      }
      if (client.nonInteractive && !p.flags['--yes']) {
        outputActionRequired(
          client,
          {
            status: 'action_required',
            reason: AGENT_REASON.CONFIRMATION_REQUIRED,
            message: 'Re-run with --yes to dismiss this installation request.',
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  `oauth-apps dismiss ${appId} --yes`
                ),
                when: 'Confirm dismiss',
              },
            ],
          },
          1
        );
        return 1;
      }
      if (!client.nonInteractive && !p.flags['--yes']) {
        const ok = await client.input.confirm(
          `Dismiss installation request for ${appId}?`,
          false
        );
        if (!ok) {
          output.log('Canceled.');
          return 0;
        }
      }
      try {
        await client.fetch(
          `/v1/oauth-apps/installation-requests/${encodeURIComponent(appId)}`,
          {
            method: 'DELETE',
          }
        );
        if (fr.jsonOutput) {
          client.stdout.write(
            `${JSON.stringify({ dismissed: appId }, null, 2)}\n`
          );
        } else {
          output.log(`Dismissed installation request for ${appId}`);
        }
        return 0;
      } catch (err) {
        if (isAPIError(err)) {
          const msg = err.serverMessage || `API error (${err.status})`;
          return emitOauthAppsApiError(client, msg, fr.jsonOutput);
        }
        throw err;
      }
    }
    case 'register': {
      if (needHelp) {
        return printHelp(registerSubcommand);
      }
      const spec = getFlagsSpecification(registerSubcommand.options);
      let p;
      try {
        p = parseArguments(args, spec);
      } catch (e) {
        if (tryEmitRegisterOptionRequiresArgumentError(client, e, args)) {
          return 1;
        }
        printError(e);
        return 1;
      }
      const fr = validateJsonOutput(p.flags as { '--format'?: string });
      if (!fr.valid) {
        output.error(fr.error);
        return 1;
      }
      const name = p.flags['--name'] as string | undefined;
      const slug = p.flags['--slug'] as string | undefined;
      const redirectUris =
        (p.flags['--redirect-uri'] as string[] | undefined) ?? [];
      const description = p.flags['--description'] as string | undefined;

      if (!name) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: AGENT_REASON.MISSING_ARGUMENTS,
            message: 'Missing --name',
            hint: `Provide a display name (3–200 characters, letters, numbers, spaces, hyphens, underscores). Example: \`${packageName} oauth-apps register --name <display-name> --slug <slug>\`.`,
            next: [
              {
                command: suggestOauthAppsCommand(
                  client,
                  'register --name <display-name> --slug <slug>'
                ),
                when: 'Replace placeholders; add --redirect-uri for each callback URL if needed',
              },
            ],
          },
          1
        );
        output.error('Missing --name');
        return 1;
      }
      if (!slug) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: AGENT_REASON.MISSING_ARGUMENTS,
            message: 'Missing --slug',
            hint: `You choose the slug when you register the app—it is not assigned by Vercel. Use a unique URL-safe id (at least 3 characters; lowercase letters, numbers, and hyphens only), often derived from the app name (e.g. \`acme-dashboard\`). Example: \`${packageName} oauth-apps register --name <display-name> --slug <slug>\`.`,
            next: [
              {
                command: suggestOauthAppsCommand(
                  client,
                  `register --name ${shellSingleQuoteArg(name)} --slug <slug>`
                ),
                when: 'Substitute <slug> with your chosen identifier; add --redirect-uri for each OAuth callback URL if needed',
              },
            ],
          },
          1
        );
        output.error('Missing --slug');
        return 1;
      }

      if (!(await ensureTeamScopeForOauthAppsApi(client, { name, slug }))) {
        return 1;
      }

      const body: {
        name: string;
        slug: string;
        redirectUris?: string[];
        description?: string;
      } = { name, slug };
      if (redirectUris.length > 0) {
        body.redirectUris = redirectUris;
      }
      if (description !== undefined) {
        body.description = description;
      }

      try {
        const app = await client.fetch<RegisteredOauthApp>('/v1/oauth-apps', {
          method: 'POST',
          body,
        });
        if (fr.jsonOutput) {
          client.stdout.write(`${JSON.stringify(app, null, 2)}\n`);
        } else {
          output.log(
            `Registered Vercel App "${app.name}" (${app.clientId}).` +
              (app.redirectUris?.length
                ? ` Redirect URIs: ${app.redirectUris.join(', ')}.`
                : '')
          );
        }
        return 0;
      } catch (err) {
        if (isAPIError(err)) {
          const msg = err.serverMessage || `API error (${err.status})`;
          return emitOauthAppsApiError(client, msg, fr.jsonOutput);
        }
        throw err;
      }
    }
    case 'install': {
      if (needHelp) {
        return printHelp(installSubcommand);
      }
      if (!(await ensureTeamScopeForOauthAppsApi(client))) {
        return 1;
      }
      const spec = getFlagsSpecification(installSubcommand.options);
      let p;
      try {
        p = parseArguments(args, spec);
      } catch (e) {
        printError(e);
        return 1;
      }
      const fr = validateJsonOutput(p.flags as { '--format'?: string });
      if (!fr.valid) {
        output.error(fr.error);
        return 1;
      }
      const clientId = p.flags['--client-id'] as string | undefined;
      const permissions =
        (p.flags['--permission'] as string[] | undefined) ?? [];
      const projectsRaw = p.flags['--projects'] as string | undefined;
      if (!clientId) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: AGENT_REASON.MISSING_ARGUMENTS,
            message: 'Missing --client-id',
            hint: `The OAuth client ID (\`cl_...\`) is issued when a Vercel App is registered (\`${packageName} oauth-apps register --name <display-name> --slug <slug>\`, or the Vercel Dashboard developer flow) or supplied by the app author. Pending installs for your team may list it; run \`${packageName} oauth-apps list-requests\` (use \`--format=json\` in scripts).`,
            next: [
              {
                command: suggestOauthAppsCommand(
                  client,
                  'list-requests --format=json'
                ),
                when: 'See pending OAuth app requests for this team (may include client identifiers)',
              },
              {
                command: suggestOauthAppsCommand(
                  client,
                  'install --client-id <client-id> --permission <scope>'
                ),
                when: 'Replace <client-id> and <scope> (e.g. read:project); repeat --permission for each scope',
              },
            ],
          },
          1
        );
        output.error('Missing --client-id');
        return 1;
      }
      if (permissions.length === 0) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: AGENT_REASON.MISSING_ARGUMENTS,
            message: 'Provide at least one --permission (repeatable)',
            hint: `Each \`--permission\` grants an OAuth scope the app needs (for example \`read:project\`). Check the app’s documentation for required scopes.`,
            next: [
              {
                command: suggestOauthAppsCommand(
                  client,
                  `install --client-id ${clientId} --permission <scope>`
                ),
                when: 'Replace <scope> (e.g. read:project); repeat --permission for each scope',
              },
            ],
          },
          1
        );
        output.error('Provide at least one --permission');
        return 1;
      }
      const body: {
        clientId: string;
        permissions: string[];
        resources?: { projectIds: string[] };
      } = {
        clientId,
        permissions,
      };
      if (projectsRaw !== undefined) {
        const projectIds =
          projectsRaw.trim() === '*'
            ? ['*']
            : projectsRaw
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
        if (projectIds.length) {
          body.resources = { projectIds };
        }
      }
      try {
        const res = await client.fetch<{
          installation: Record<string, unknown>;
        }>('/v1/oauth-apps/installations', { method: 'POST', body });
        if (fr.jsonOutput) {
          client.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
        } else {
          output.log('App installed successfully.');
        }
        return 0;
      } catch (err) {
        if (isAPIError(err)) {
          const msg = err.serverMessage || `API error (${err.status})`;
          return emitOauthAppsApiError(client, msg, fr.jsonOutput);
        }
        throw err;
      }
    }
    case 'remove': {
      if (needHelp) {
        return printHelp(removeSubcommand);
      }
      if (!(await ensureTeamScopeForOauthAppsApi(client))) {
        return 1;
      }
      const spec = getFlagsSpecification(removeSubcommand.options);
      let p;
      try {
        p = parseArguments(args, spec);
      } catch (e) {
        printError(e);
        return 1;
      }
      const installationId = p.args[0];
      const fr = validateJsonOutput(p.flags as { '--format'?: string });
      if (!fr.valid) {
        output.error(fr.error);
        return 1;
      }
      if (!installationId) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: AGENT_REASON.MISSING_ARGUMENTS,
            message: 'Missing installation id',
          },
          1
        );
        output.error('Missing installation id');
        return 1;
      }
      if (client.nonInteractive && !p.flags['--yes']) {
        outputActionRequired(
          client,
          {
            status: 'action_required',
            reason: AGENT_REASON.CONFIRMATION_REQUIRED,
            message: 'Re-run with --yes to uninstall.',
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  `oauth-apps remove ${installationId} --yes`
                ),
                when: 'Confirm uninstall',
              },
            ],
          },
          1
        );
        return 1;
      }
      if (!client.nonInteractive && !p.flags['--yes']) {
        const ok = await client.input.confirm(
          `Uninstall Vercel App installation ${installationId}?`,
          false
        );
        if (!ok) {
          output.log('Canceled.');
          return 0;
        }
      }
      try {
        await client.fetch(
          `/v1/oauth-apps/installations/${encodeURIComponent(installationId)}`,
          { method: 'DELETE' }
        );
        if (fr.jsonOutput) {
          client.stdout.write(
            `${JSON.stringify({ uninstalled: installationId }, null, 2)}\n`
          );
        } else {
          output.log(`Uninstalled ${installationId}`);
        }
        return 0;
      } catch (err) {
        if (isAPIError(err)) {
          const msg = err.serverMessage || `API error (${err.status})`;
          return emitOauthAppsApiError(client, msg, fr.jsonOutput);
        }
        throw err;
      }
    }
    default: {
      if (needHelp) {
        return printHelp(listRequestsSubcommand);
      }
      if (!(await ensureTeamScopeForOauthAppsApi(client))) {
        return 1;
      }
      const spec = getFlagsSpecification(listRequestsSubcommand.options);
      let p;
      try {
        p = parseArguments(args, spec);
      } catch (e) {
        printError(e);
        return 1;
      }
      const fr = validateJsonOutput(p.flags as { '--format'?: string });
      if (!fr.valid) {
        output.error(fr.error);
        return 1;
      }
      try {
        const data = await client.fetch<{
          installationRequests: InstallationRequest[];
        }>('/v1/oauth-apps/installation-requests');
        if (fr.jsonOutput) {
          client.stdout.write(
            `${JSON.stringify({ installationRequests: data.installationRequests }, null, 2)}\n`
          );
          return 0;
        }
        if (!data.installationRequests?.length) {
          output.log('No pending installation requests.');
          return 0;
        }
        for (const r of data.installationRequests) {
          output.log(
            `${r.app.name} (${r.app.id}) — requested by ${r.requester.name}`
          );
        }
        return 0;
      } catch (err) {
        if (isAPIError(err)) {
          const msg = err.serverMessage || `API error (${err.status})`;
          return emitOauthAppsApiError(client, msg, fr.jsonOutput);
        }
        throw err;
      }
    }
  }
}
