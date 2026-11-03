import type Client from '../../util/client';
import updateSettings from './settings';

export default function disable(
  client: Client,
  argv: string[]
): Promise<number> {
  return updateSettings(client, argv, 'disable');
}
