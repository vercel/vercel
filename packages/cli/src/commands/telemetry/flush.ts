import type Client from '../../util/client';

export default async function enable(client: Client, args: string[]) {
  const url =
    process.env.VERCEL_TELEMETRY_BRIDGE_URL ||
    'https://telemetry.vercel.com/api/vercel-cli/v1/events';
  const { headers, body } = JSON.parse(args[0]);
  const res = await client.fetch(url, {
    method: 'POST',
    headers,
    body,
    json: false,
  });
  const status = res.status;
  const cliTracked = res.headers.get('x-vercel-cli-tracked') || '';
  process.stdout.write(JSON.stringify({ status, cliTracked }));
  return 0;
}
