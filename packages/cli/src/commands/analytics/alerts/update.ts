import type Client from '../../../util/client';
import output from '../../../output-manager';

type UpdateFlags = { '--json'?: boolean; '--format'?: string };

export default async function update(
  client: Client,
  args: string[],
  flags: UpdateFlags
): Promise<number> {
  const alertId = args[0];
  if (!alertId) {
    output.error('Usage: vercel analytics alerts update <alert-id>');
    return 1;
  }
  if (!flags['--json']) {
    output.error(
      "Pass full alert payload via stdin: echo '{...}' | vercel analytics alerts update <id> --json"
    );
    return 1;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  const data = await client.fetch<unknown>(
    `/v1/insights/monitoring/alerts/${encodeURIComponent(alertId)}`,
    { method: 'PUT', body }
  );
  if (flags['--format'] === 'json') {
    output.print(JSON.stringify(data, null, 2));
    return 0;
  }
  output.log('Alert updated.');
  return 0;
}
