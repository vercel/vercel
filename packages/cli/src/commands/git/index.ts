import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { printError } from '../../util/error';
import connect from './connect';
import disconnect from './disconnect';
import passthrough from './passthrough';
import { help } from '../help';
import { gitCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { GitTelemetryClient } from '../../util/telemetry/commands/git';
import type Client from '../../util/client';
import getSubcommand from '../../util/get-subcommand';

const COMMAND_CONFIG = {
  connect: ['connect'],
  disconnect: ['disconnect'],
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(gitCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }
  const telemetry = new GitTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  // Slice past `git` – parseArguments args includes "git" as first positional when permissive
  // e.g. argv = ['vc','git','push'] => parsedArgs.args = ['git','push']
  const rawAfterGit =
    parsedArgs.args[0] === 'git' ? parsedArgs.args.slice(1) : parsedArgs.args;

  // If no args at all => show help
  if (rawAfterGit.length === 0) {
    if (parsedArgs.flags['--help']) {
      telemetry.trackCliFlagHelp('git', undefined);
    }
    output.print(help(gitCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  if (parsedArgs.flags['--help']) {
    // `vc git --help` or `vc git connect --help` etc – keep explicit help for subcommands
    // If user did `vc git push --help`, we should pass through to git, not intercept.
    // Only intercept help when subcommand is known or no git passthrough intent.
    const isPassthrough = subcommand === undefined;
    if (!isPassthrough) {
      telemetry.trackCliFlagHelp('git', subcommand);
      output.print(help(gitCommand, { columns: client.stderr.columns }));
      return 2;
    }
    // else fall through to passthrough – it will run `git push --help` natively
  }

  switch (subcommand) {
    case 'connect':
      telemetry.trackCliSubcommandConnect(subcommandOriginal);
      return connect(client, args);
    case 'disconnect':
      telemetry.trackCliSubcommandDisconnect(subcommandOriginal);
      return disconnect(client, args);
    default: {
      // Not a known subcommand: treat as git passthrough
      // rawAfterGit is pure git args (wrapper flags like --no-attach already
      // extracted into parsedArgs.flags by parseArguments because they are defined
      // in gitCommand.options).
      const isPush = rawAfterGit[0] === 'push';

      // Track passthrough telemetry
      try {
        (telemetry as any).trackCliSubcommandPassthrough?.(
          rawAfterGit[0] || 'unknown'
        );
      } catch {}
      if (isPush) {
        telemetry.trackCliFlagNoAttach(
          Boolean(parsedArgs.flags['--no-attach'])
        );
        telemetry.trackCliFlagLogs(Boolean(parsedArgs.flags['--logs']));
        telemetry.trackCliFlagNoLogs(Boolean(parsedArgs.flags['--no-logs']));
      }

      const wrapperOpts = {
        noAttach: Boolean(parsedArgs.flags['--no-attach']),
        logs: Boolean(parsedArgs.flags['--logs']),
        noLogs: Boolean(parsedArgs.flags['--no-logs']),
      };

      const result = await passthrough(client, rawAfterGit as string[], wrapperOpts);

      // Return git's exit code directly to preserve plumbing expectations
      return result;
    }
  }
}
