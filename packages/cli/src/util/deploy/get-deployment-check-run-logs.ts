import type Client from '../client';

export interface CheckRunLog {
  level: string;
  timestamp: number;
  message: string;
}

const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2000;

function parseNdjson(
  text: string
): { level: string; timestamp: number; message: string }[] {
  const entries: { level: string; timestamp: number; message: string }[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

export async function getDeploymentCheckRunLogs(
  client: Client,
  deploymentId: string,
  checkRunId: string
): Promise<CheckRunLog[]> {
  const url = `/v2/deployments/${encodeURIComponent(deploymentId)}/check-runs/${encodeURIComponent(checkRunId)}/logs`;

  // The log stream is NDJSON terminated by an `eof` entry. Logs may not be
  // flushed immediately after a check run completes, so we wait briefly then
  // poll until we see the `eof` marker confirming all logs have been written.
  await new Promise(resolve => setTimeout(resolve, 1000));

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0)
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await client.fetch(url, { json: false });
    const text: string =
      typeof res === 'string' ? res : await (res as any).text();
    const entries = parseNdjson(text);

    const hasEof = entries.some(e => e.level === 'eof');
    if (hasEof) {
      return entries
        .filter(e => e.level !== 'eof' && e.level !== 'debug')
        .map(({ level, timestamp, message }) => ({
          level,
          timestamp,
          message,
        }));
    }
  }

  return [];
}
