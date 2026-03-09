import type Client from '../../util/client';
import output from '../../output-manager';

export default async function notebooksGet(
  client: Client,
  args: string[],
  flags: { '--format'?: string }
): Promise<number> {
  const id = args[0];
  if (!id) {
    output.error('Usage: vercel observability notebooks get <notebook-id>');
    return 1;
  }
  const data = await client.fetch<unknown>(
    `/v1/observability/notebook/${encodeURIComponent(id)}`
  );
  if (flags['--format'] === 'json') {
    output.print(JSON.stringify(data, null, 2));
    return 0;
  }
  output.print(JSON.stringify(data, null, 2));
  return 0;
}
