import type Client from '../../../util/client';
import output from '../../../output-manager';

export default async function get(
  client: Client,
  args: string[],
  flags: { '--format'?: string }
): Promise<number> {
  const alertId = args[0];
  if (!alertId) {
    output.error('Usage: vercel analytics alerts get <alert-id>');
    return 1;
  }
  const data = await client.fetch<unknown>(
    `/v1/insights/monitoring/alerts/${encodeURIComponent(alertId)}`
  );
  if (flags['--format'] === 'json') {
    output.print(JSON.stringify(data, null, 2));
    return 0;
  }
  output.print(JSON.stringify(data, null, 2));
  return 0;
}
