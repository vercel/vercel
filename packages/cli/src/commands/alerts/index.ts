import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { alertsCommand } from './command';

export default async function alerts(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(alertsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const needHelp = parsedArgs.flags['--help'];

  if (needHelp) {
    output.print(help(alertsCommand, { columns: client.stderr.columns }));
    return 0;
  }

  const listFn = (await import('./list')).default;
  return listFn(client);
}
