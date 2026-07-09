import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import { help } from '../../help';
import output from '../../../output-manager';
import { sandboxCommand } from '../command';
import { shSubcommand } from './command';
import { buildCreateOptions, runCreate } from '../create';
import { SandboxTargetError } from '../../../util/sandbox/target';

export default async function sh(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(shSubcommand.options)
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(
      help(shSubcommand, {
        parent: sandboxCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  try {
    await runCreate(client, {
      ...buildCreateOptions(parsedArgs.flags),
      connect: true,
    });

    return 0;
  } catch (err) {
    printError(err);
    return err instanceof SandboxTargetError ? err.exitCode : 1;
  }
}
