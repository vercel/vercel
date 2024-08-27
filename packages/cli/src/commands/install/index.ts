import Client from '../../util/client';
import { add } from '../integration/add';

export default async function install(client: Client) {
  await add(client, client.argv.slice(3));
}
