import type Client from '../../../util/client';
import type { JSONObject } from '@vercel-internals/types';
import output from '../../../output-manager';

type CreateFlags = {
  '--name'?: string;
  '--subscribers'?: string;
  '--json'?: boolean;
  '--format'?: string;
};

export default async function create(
  client: Client,
  _args: string[],
  flags: CreateFlags
): Promise<number> {
  let body: {
    name: string;
    filters: unknown[];
    alert_rules: unknown[];
    subscribers: string[];
  };

  if (flags['--json']) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const raw = JSON.parse(Buffer.concat(chunks).toString());
    body = {
      name: raw.name,
      filters: raw.filters ?? [],
      alert_rules: raw.alert_rules ?? raw.alertRules ?? [],
      subscribers: Array.isArray(raw.subscribers) ? raw.subscribers : [],
    };
  } else {
    const name = flags['--name'];
    const subscribers = flags['--subscribers']
      ?.split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!name || !subscribers?.length) {
      output.error(
        'Provide --name and --subscribers, or pipe JSON to stdin with --json. Example: vercel analytics alerts create --name "High Errors" --subscribers user_xxx'
      );
      return 1;
    }
    body = {
      name,
      filters: [],
      alert_rules: [{ column: 'requests', operator: '>', value: 100 }],
      subscribers,
    };
  }

  const data = await client.fetch<{ id: string }>(
    '/v1/insights/monitoring/alerts',
    { method: 'POST', body: body as JSONObject }
  );
  if (flags['--format'] === 'json') {
    output.print(JSON.stringify(data, null, 2));
    return 0;
  }
  output.log(`Created monitoring alert: ${data?.id ?? '—'}`);
  return 0;
}
