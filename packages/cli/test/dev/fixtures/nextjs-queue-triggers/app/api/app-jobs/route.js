import { handleCallback } from '@vercel/queue';
import { record } from '../../../record';

export const POST = handleCallback(
  (payload, metadata) => record('app', 'v1', payload, metadata),
  { retry: () => ({ afterSeconds: 1 }) }
);
