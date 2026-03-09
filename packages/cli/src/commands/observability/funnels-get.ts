import type Client from '../../util/client';
import output from '../../output-manager';

export default async function funnelsGet(
  client: Client,
  args: string[],
  flags: { '--format'?: string }
): Promise<number> {
  const id = args[0];
  if (!id) {
    output.error('Usage: vercel observability funnels get <funnel-id>');
    return 1;
  }
  const data = await client.fetch<unknown>(
    `/v1/observability/funnels/${encodeURIComponent(id)}`
  );
  if (flags['--format'] === 'json') {
    output.print(JSON.stringify(data, null, 2));
    return 0;
  }
  output.print(JSON.stringify(data, null, 2));
  return 0;
}
