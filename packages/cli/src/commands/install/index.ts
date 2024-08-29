import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { help } from '../help';
import { add } from '../integration/add';
import { installCommand } from './command';

export default async function install(client: Client) {
  const { flags } = parseArguments(client.argv.slice(2));

  if (flags['--help']) {
    client.output.print(
      help(installCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  await add(client, client.argv.slice(3));
}
