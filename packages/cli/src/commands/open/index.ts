import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { help } from '../help';
import { openIntegration } from '../integration/open-integration';
import { openCommand } from './command';

export default async function open(client: Client) {
  const { args, flags } = parseArguments(client.argv.slice(2));

  if (flags['--help']) {
    client.output.print(help(openCommand, { columns: client.stderr.columns }));
    return 2;
  }

  await openIntegration(client, args.slice(1));
}
