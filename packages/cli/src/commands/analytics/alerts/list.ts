import type Client from '../../../util/client';
import output from '../../../output-manager';

export default async function list(
  client: Client,
  _args: string[],
  flags: { '--format'?: string }
): Promise<number> {
  const data = await client.fetch<{ alerts: unknown[] }>(
    '/v1/insights/monitoring/alerts'
  );
  if (flags['--format'] === 'json') {
    output.print(JSON.stringify(data, null, 2));
    return 0;
  }
  if (!data.alerts?.length) {
    output.log('No monitoring alerts found.');
    return 0;
  }
  for (const alert of data.alerts as { id?: string; name?: string }[]) {
    output.print(`${alert.id ?? '—'}  ${alert.name ?? '—'}`);
  }
  return 0;
}
