import getSubcommand from '../../util/get-subcommand';
import output from '../../output-manager';
import type Client from '../../util/client';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';

export const MONITORS_CONFIG = {
  ls: ['ls', 'list'],
  schema: ['schema'],
  add: ['add', 'create'],
  inspect: ['inspect', 'get'],
  rm: ['rm', 'remove', 'delete'],
  update: ['update', 'patch'],
};

export async function runMonitors(
  client: Client,
  argv: string[]
): Promise<number> {
  if (argv.length === 0 || argv[0]?.startsWith('-')) {
    const lsFn = (await import('./ls')).default;
    return lsFn(client, argv);
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    argv,
    MONITORS_CONFIG
  );
  if (subcommand == null) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `Unknown "monitors" subcommand "${argv[0]}".`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'monitors --help'
            ),
            when: 'Show valid monitors subcommands',
          },
        ],
      },
      1
    );
    output.error(
      `Unknown "monitors" subcommand "${argv[0]}". Run \`vercel monitors --help\`.`
    );
    return 1;
  }

  switch (subcommand) {
    case 'ls':
      return (await import('./ls')).default(client, args);
    case 'schema':
      return (await import('./schema')).default(client, args);
    case 'add':
      return (await import('./add')).default(client, args);
    case 'inspect':
      return (await import('./rule-inspect')).default(client, args);
    case 'rm':
      return (await import('./rm')).default(client, args);
    case 'update':
      return (await import('./update')).default(client, args);
    default:
      output.error(
        `Unhandled monitors subcommand: ${String(subcommandOriginal)}`
      );
      return 1;
  }
}
