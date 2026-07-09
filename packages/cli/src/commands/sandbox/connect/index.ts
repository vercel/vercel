import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import { help } from '../../help';
import output from '../../../output-manager';
import { sandboxCommand } from '../command';
import { connectSubcommand } from './command';
import {
  resolveSandboxTarget,
  SandboxTargetError,
} from '../../../util/sandbox/target';
import { sandboxClient } from '../../../util/sandbox/client';
import { execInSandbox } from '../../../util/sandbox/exec-core';
import { assertSandboxName, parseKeyValues } from '../../../util/sandbox/args';

export default async function connect(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(connectSubcommand.options)
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(
      help(connectSubcommand, {
        parent: sandboxCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  const [name] = parsedArgs.args;

  try {
    assertSandboxName(name);

    const { token, teamId, projectId } = await resolveSandboxTarget(client, {
      project: parsedArgs.flags['--project'],
    });

    const sandbox = await sandboxClient.get({
      name,
      token,
      teamId,
      projectId,
      resume: true,
      __includeSystemRoutes: true,
    });

    await execInSandbox({
      sandbox,
      command: 'sh',
      args: [],
      interactive: true,
      sudo: Boolean(parsedArgs.flags['--sudo']),
      skipExtendingTimeout: Boolean(parsedArgs.flags['--no-extend-timeout']),
      cwd: parsedArgs.flags['--workdir'],
      env: parseKeyValues(parsedArgs.flags['--env'] ?? []),
      timeout: undefined,
    });

    return 0;
  } catch (err) {
    printError(err);
    return err instanceof SandboxTargetError ? err.exitCode : 1;
  }
}
