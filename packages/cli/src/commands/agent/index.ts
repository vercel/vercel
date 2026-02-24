import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { ensureLink } from '../../util/link/ensure-link';
import { ensureAgentAuth } from '../../util/agent-auth/ensure-agent-auth';
import { type Command, help } from '../help';
import { agentCommand, setupSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getCommandAliases } from '..';

const COMMAND_CONFIG = {
  setup: getCommandAliases(setupSubcommand),
};

export default async function agent(client: Client): Promise<number> {
  const flagsSpecification = getFlagsSpecification(agentCommand.options);

  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: agentCommand,
        columns: client.stderr.columns,
      })
    );
  }

  if (subcommand === 'setup') {
    if (parsedArgs.flags['--help']) {
      printHelp(setupSubcommand);
      return 2;
    }

    const yes = !!parsedArgs.flags['--yes'];
    const link = await ensureLink('agent setup', client, client.cwd, {
      autoConfirm: yes,
      nonInteractive: client.nonInteractive,
    });

    if (typeof link === 'number') {
      return link;
    }

    if (link.status !== 'linked') {
      output.error('Project must be linked before setting up agent OAuth.');
      return 1;
    }

    const agentAuth = await ensureAgentAuth(client, link, {
      forceCreate: true,
    });

    if (typeof agentAuth === 'number') {
      return agentAuth;
    }

    output.success(
      'Agent OAuth app configured for this project. AI agents will use this token when running in this directory.'
    );
    return 0;
  }

  // No subcommand or unknown: show agent command help
  if (parsedArgs.flags['--help'] || parsedArgs.flags['-h']) {
    output.print(help(agentCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (subcommandOriginal && subcommandOriginal !== 'default') {
    output.error(`Unknown subcommand: ${subcommandOriginal}`);
  }
  output.print(help(agentCommand, { columns: client.stderr.columns }));
  return 2;
}
