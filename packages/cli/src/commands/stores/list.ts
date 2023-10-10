import Client from '../../util/client';
import { listStores } from '../../util/stores/list-stores';
import table from 'text-table';

type ListOptions = {
  client: Client;
};

export async function list({ client }: ListOptions) {
  const stores = await listStores({ client });

  if (!stores) {
    return 1;
  }

  client.output.print(
    `\n${table([
      ['Type', 'Name', 'Id'],
      ...stores
        .sort((a, b) => (a.type > b.type ? 1 : -1))
        .map(store => [store.type, store.name, store.id]),
    ])}\n`
  );

  return 0;
}
