import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { removeSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import { canPrompt } from '../../util/can-prompt';
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
    return 2;
  }

  const id = parsedArgs.args[0];
  if (!id) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'missing_arguments',
        message:
          'Token id is required. Example: `vercel tokens revoke tok_abc123`',
        hint: 'Run `tokens ls` to list ids, then pass the id to `tokens revoke`.',
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'tokens ls'),
            when: 'List personal access token ids for the current account',
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'tokens revoke <token_id>'
            ),
            when: 'Revoke a token after replacing <token_id> with an id from the list',
          },
        ],
      },
      2
    );
    output.error(
      'Token id is required. Example: `vercel tokens revoke tok_abc123`'
    );
    return 2;
  }
  if (parsedArgs.args.length > 1) {
    output.error('Too many arguments. Pass a single token id.');
    return 2;
  }

  const validation = validateJsonOutput(parsedArgs.flags);
  if (!validation.valid) {
    output.error(validation.error);
    return 1;
  }
  const asJson = validation.jsonOutput;

  // Revoking a token cuts off anything that uses it, so ask first. Without a
  // terminal it still goes ahead for now, with a warning.
  if (!parsedArgs.flags['--yes'] && !asJson) {
    if (canPrompt(client)) {
      const confirmed = await client.input.confirm(
        `Revoke token ${id}? Anything that uses it will stop working.`,
        false
      );
      if (!confirmed) {
        output.log('Canceled. Nothing was changed.');
        return 130;
      }
    } else {
      output.warning(
        'Revoking a token without a terminal will need --yes in a future major version. Add --yes to keep this working.'
      );
    }
  }

  await client.fetch(`/v3/user/tokens/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    useCurrentTeam: false,
  });

  if (asJson) {
    client.stdout.write(`${JSON.stringify({ ok: true, id }, null, 2)}\n`);
    return 0;
  }

  output.success(`Revoked token ${id}`);
  return 0;
}
