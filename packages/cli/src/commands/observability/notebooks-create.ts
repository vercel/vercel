import type Client from '../../util/client';
import type { JSONObject } from '@vercel-internals/types';
import output from '../../output-manager';
import { readFileSync } from 'fs';

export default async function notebooksCreate(
  client: Client,
  _args: string[],
  flags: { '--file'?: string; '--format'?: string }
): Promise<number> {
  let body: unknown;
  if (flags['--file']) {
    body = JSON.parse(readFileSync(flags['--file'], 'utf-8'));
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    body = JSON.parse(Buffer.concat(chunks).toString());
  }
  const data = await client.fetch<unknown>('/v1/observability/notebook', {
    method: 'POST',
    body: body as JSONObject,
  });
  if (flags['--format'] === 'json') {
    output.print(JSON.stringify(data, null, 2));
    return 0;
  }
  output.log('Notebook created.');
  return 0;
}
