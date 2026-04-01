import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { accessGroupInspectSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';

export default async function accessGroupInspect(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    accessGroupInspectSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.args.length !== 1) {
    output.error(
      'Invalid number of arguments. Usage: `vercel project access-group <id-or-name>`'
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  const idOrName = parsedArgs.args[0];
  const data = await client.fetch<Record<string, unknown>>(
    `/v1/access-groups/${encodeURIComponent(idOrName)}`
  );

  client.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  return 0;
}
