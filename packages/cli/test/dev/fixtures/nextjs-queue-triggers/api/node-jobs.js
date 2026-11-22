import { QueueClient } from '@vercel/queue';
import { record } from '../record';

export default new QueueClient().handleNodeCallback(
  (payload, metadata) => record('node', 'v1', payload, metadata),
  { retry: () => ({ afterSeconds: 1 }) }
);
