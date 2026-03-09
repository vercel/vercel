import type Client from '../../../util/client';
import output from '../../../output-manager';

type ValidateFlags = { '--json'?: boolean; '--format'?: string };

export default async function validateWebhook(
  client: Client,
  _args: string[],
  flags: ValidateFlags
): Promise<number> {
  if (!flags['--json']) {
    output.error(
      'Pass config via stdin. Example: echo \'{"configKind":"pagerdutyConfig","config":{"severity":"critical","routingKey":"xxx","source":"vercel"}}\' | vercel analytics alerts validate-webhook --json'
    );
    return 1;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  const data = await client.fetch<unknown>(
    '/v1/insights/monitoring/alerts/validate-webhook',
    { method: 'POST', body }
  );
  if (flags['--format'] === 'json') {
    output.print(JSON.stringify(data, null, 2));
    return 0;
  }
  output.log('Webhook config valid.');
  return 0;
}
