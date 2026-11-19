import type Client from '../../util/client';
import { setEnabled } from './inference-hooks-enable';

export default function disable(client: Client, argv: string[]) {
  return setEnabled(client, argv, false);
}
