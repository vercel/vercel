import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { addSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import { outputAgentError } from '../../util/agent-output';

interface CreateTokenResponse {
  token?: { id?: string; name?: string };
  bearerToken?: string;
}

export default async function add(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const { args } = parsedArgs;
  const name = args[0]?.trim();
  if (!name) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_arguments',
          message:
            'Token name is required. Example: `vercel tokens add "My token"`',
        },
        1
      );
    }
    output.error(
      'Token name is required. Example: `vercel tokens add "My token"`'
    );
    return 1;
  }
  if (args.length > 1) {
    output.error('Too many arguments. Pass a single token name.');
    return 1;
  }

  const validation = validateJsonOutput(parsedArgs.flags);
  if (!validation.valid) {
    output.error(validation.error);
    return 1;
  }
  const asJson = validation.jsonOutput;

  const projectId = parsedArgs.flags['--project'];
  const body: { name: string; projectId?: string } = { name };
  if (typeof projectId === 'string' && projectId.length > 0) {
    body.projectId = projectId;
  }

  const result = await client.fetch<CreateTokenResponse>('/v3/user/tokens', {
    method: 'POST',
    body,
    useCurrentTeam: false,
  });

  if (asJson) {
    client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  output.success(
    'Token created. Save the value below — it will not be shown again.'
  );
  if (result.bearerToken) {
    output.log(result.bearerToken);
  }
  if (result.token?.id) {
    output.log(`id: ${result.token.id}`);
  }
  return 0;
}
