import getSubcommand from '../../../util/get-subcommand';
import output from '../../../output-manager';
import type Client from '../../../util/client';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';

const RULES_CONFIG = {
  ls: ['ls', 'list'],
  add: ['add', 'create'],
  inspect: ['inspect', 'get'],
  rm: ['rm', 'remove', 'delete'],
  update: ['update', 'patch'],
};

export default async function rules(
  client: Client,
  argv: string[]
): Promise<number> {
  if (argv.length === 0) {
    const lsFn = (await import('./ls')).default;
    return lsFn(client, []);
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    argv,
    RULES_CONFIG
  );
  if (subcommand == null) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `Unknown "alerts rules" subcommand "${argv[0]}".`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'alerts rules --help'
            ),
            when: 'Show valid rules subcommands',
          },
        ],
      },
      1
    );
    output.error(
      `Unknown "alerts rules" subcommand "${argv[0]}". Run \`vercel alerts rules --help\`.`
    );
    return 1;
  }

  switch (subcommand) {
    case 'ls':
      return (await import('./ls')).default(client, args);
    case 'add':
      return (await import('./add')).default(client, args);
    case 'inspect':
      return (await import('./rule-inspect')).default(client, args);
    case 'rm':
      return (await import('./rm')).default(client, args);
    case 'update':
      return (await import('./update')).default(client, args);
    default:
      output.error(`Unhandled rules subcommand: ${String(subcommandOriginal)}`);
      return 1;
  }
}
