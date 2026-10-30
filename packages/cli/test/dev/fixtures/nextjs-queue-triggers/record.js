import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function record(router, version, payload, metadata) {
  const directory = join(process.cwd(), '.results');
  await mkdir(directory, { recursive: true });
  await appendFile(
    join(directory, 'deliveries.jsonl'),
    `${JSON.stringify({ router, version, payload, metadata, pid: process.pid })}\n`
  );
  if (payload?.failOnce && metadata.deliveryCount === 1) {
    throw new Error('Intentional first-delivery failure');
  }
}
