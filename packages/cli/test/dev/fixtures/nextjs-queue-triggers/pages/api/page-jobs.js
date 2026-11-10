import { QueueClient } from '@vercel/queue';
import { record } from '../../record';

export default new QueueClient().handleNodeCallback(
  (payload, metadata) => record('pages', 'v1', payload, metadata),
  { retry: () => ({ afterSeconds: 1 }) }
);
