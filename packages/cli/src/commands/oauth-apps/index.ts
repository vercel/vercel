import confirm from '@inquirer/confirm';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import {
  dismissSubcommand,
  installSubcommand,
  listRequestsSubcommand,
  oauthAppsCommand,
  removeSubcommand,
} from './command';
import { validateJsonOutput } from '../../util/output-format';
import {
  buildCommandWithGlobalFlags,
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { isAPIError } from '../../util/errors-ts';

const COMMAND_CONFIG = {
  listRequests: getCommandAliases(listRequestsSubcommand),
  dismiss: getCommandAliases(dismissSubcommand),
  install: getCommandAliases(installSubcommand),
  remove: getCommandAliases(removeSubcommand),
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
