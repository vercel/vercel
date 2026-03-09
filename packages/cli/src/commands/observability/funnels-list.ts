import type Client from '../../util/client';
import output from '../../output-manager';

export default async function funnelsList(
  client: Client,
  _args: string[],
  flags: { '--format'?: string }
): Promise<number> {
  const data = await client.fetch<unknown>('/v1/observability/funnels');
  if (flags['--format'] === 'json') {
    output.print(JSON.stringify(data, null, 2));
    return 0;
  }
  output.print(JSON.stringify(data, null, 2));
  return 0;
}
