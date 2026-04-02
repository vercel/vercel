import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { removeSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';

export default async function rm(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const id = parsedArgs.args[0];
  if (!id) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'missing_arguments',
        message: 'Token id is required. Example: `vercel tokens rm tok_abc123`',
        hint: 'Run `tokens ls` to list ids, then pass the id to `tokens rm`.',
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'tokens ls'),
            when: 'List personal access token ids for the current account',
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'tokens rm <token_id>'
            ),
            when: 'Remove a token after replacing <token_id> with an id from the list',
          },
        ],
      },
      1
    );
    output.error(
      'Token id is required. Example: `vercel tokens rm tok_abc123`'
    );
    return 1;
  }
  if (parsedArgs.args.length > 1) {
    output.error('Too many arguments. Pass a single token id.');
    return 1;
  }

  const validation = validateJsonOutput(parsedArgs.flags);
  if (!validation.valid) {
    output.error(validation.error);
    return 1;
  }
  const asJson = validation.jsonOutput;

  await client.fetch(`/v3/user/tokens/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    useCurrentTeam: false,
  });

  if (asJson) {
    client.stdout.write(`${JSON.stringify({ ok: true, id }, null, 2)}\n`);
    return 0;
  }

  output.success(`Removed token ${id}`);
  return 0;
}
