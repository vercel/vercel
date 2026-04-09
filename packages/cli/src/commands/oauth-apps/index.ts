import confirm from '@inquirer/confirm';
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
 * Global CLI flags from argv, stopping before `oauth-apps`, so suggested commands
 * do not append the current subcommand as stray tokens.
 */
function getCliGlobalsBeforeOauthApps(client: Client): string[] {
  const args = client.argv.slice(2);
  const oauthIdx = args.indexOf('oauth-apps');
  const onlyGlobals = oauthIdx <= 0 ? [] : args.slice(0, oauthIdx);
  const pseudoArgv = [
    client.argv[0] ?? 'node',
    client.argv[1] ?? 'cli.js',
    ...onlyGlobals,
  ];
  return getGlobalFlagsFromArgv(pseudoArgv);
}

/** Suggested `vercel [globals] <tail>` with the same globals as the current oauth-apps invocation. */
function suggestVercelCommand(client: Client, commandTail: string): string {
  const globals = getCliGlobalsBeforeOauthApps(client);
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
        const ok = await confirm({
          message: `Dismiss installation request for ${appId}?`,
        });
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
          if (fr.jsonOutput) {
            outputAgentError(
              client,
              { status: 'error', reason: 'api_error', message: msg },
              1
            );
            return 1;
          }
          output.error(msg);
          return 1;
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
            hint: `Provide a display name (3–200 characters, letters, numbers, spaces, hyphens, underscores). Example: \`${packageName} oauth-apps register --name "My App" --slug my-app\`.`,
            next: [
              {
                command: suggestOauthAppsCommand(
                  client,
                  'register --name "My App" --slug my-app'
                ),
                when: 'Minimal registration (add --redirect-uri as needed)',
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
            hint: `The slug is the URL-safe id (lowercase letters, numbers, hyphens). Example: \`${packageName} oauth-apps register --name "My App" --slug my-app\`.`,
            next: [
              {
                command: suggestOauthAppsCommand(
                  client,
                  `register --name ${JSON.stringify(name)} --slug my-app`
                ),
                when: 'Add a slug; repeat --redirect-uri for each callback URL',
              },
            ],
          },
          1
        );
        output.error('Missing --slug');
        return 1;
      }

      const { team } = await getScope(client);
      if (!team) {
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
                  `register --name ${JSON.stringify(name)} --slug ${JSON.stringify(slug)}`
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
        return 1;
      }

      client.config.currentTeam = team.id;

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
          if (fr.jsonOutput) {
            outputAgentError(
              client,
              { status: 'error', reason: AGENT_REASON.API_ERROR, message: msg },
              1
            );
            return 1;
          }
          output.error(msg);
          return 1;
        }
        throw err;
      }
    }
    case 'install': {
      if (needHelp) {
        return printHelp(installSubcommand);
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
            hint: `The OAuth client ID (\`cl_...\`) is issued when a Vercel App is registered (\`${packageName} oauth-apps register\`, or the Vercel Dashboard developer flow) or supplied by the app author. Pending installs for your team may list it; run \`${packageName} oauth-apps list-requests\` (use \`--format=json\` in scripts).`,
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
                  'install --client-id <client-id> --permission read:project'
                ),
                when: 'After you have a client id, substitute it for <client-id>; repeat --permission for each scope',
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
                  `install --client-id ${clientId} --permission read:project`
                ),
                when: 'Example with one scope; add more --permission flags as required',
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
          output.error(err.serverMessage || `API error (${err.status})`);
          return 1;
        }
        throw err;
      }
    }
    case 'remove': {
      if (needHelp) {
        return printHelp(removeSubcommand);
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
        const ok = await confirm({
          message: `Uninstall Vercel App installation ${installationId}?`,
        });
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
          output.error(err.serverMessage || `API error (${err.status})`);
          return 1;
        }
        throw err;
      }
    }
    default: {
      if (needHelp) {
        return printHelp(listRequestsSubcommand);
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
          output.error(err.serverMessage || `API error (${err.status})`);
          return 1;
        }
        throw err;
      }
    }
  }
}
