import { randomUUID } from 'node:crypto';
import fetch from '../../util/fetch';
import type Client from '../../util/client';
import { getConfigTelemetryEvents } from '../../util/telemetry/config';
import { collectCachedVersionContextForTelemetry } from '../../util/telemetry/version-context-cache';
import { getVersionContextTelemetryEvents } from '../../util/telemetry/version-context';
import type { TraceEvent } from '@vercel/build-utils';

export const TELEMETRY_FLUSH_TIMEOUT_MS = 10_000;

type TelemetryEvent = Record<string, unknown> & {
  id: string;
  invocation_id?: string | null;
  event_time: number;
  key: string;
  value: string;
};

interface FlushOptions {
  timeoutMs?: number;
}

interface Handoff {
  invocationId?: string;
  headers: Record<string, string>;
  body: TelemetryEvent[];
  commandTrace?: { event: TraceEvent; buildLabel?: string };
}

function parseHandoff(serialized: string): Handoff | undefined {
  try {
    const value = JSON.parse(serialized);
    if (
      value &&
      typeof value === 'object' &&
      value.headers &&
      typeof value.headers === 'object' &&
      Array.isArray(value.body)
    ) {
      return value as Handoff;
    }
  } catch {
    // A truncated or empty handoff is dropped below.
  }
  return undefined;
}

export default async function flush(
  client: Client,
  args: string[],
  { timeoutMs = TELEMETRY_FLUSH_TIMEOUT_MS }: FlushOptions = {}
) {
  const url =
    process.env.VERCEL_TELEMETRY_BRIDGE_URL ||
    'https://telemetry.vercel.com/api/vercel-cli/v1/events';
  // Keep accepting older argv handoffs while the launcher uses stdin.
  let serialized = args[0];
  if (!serialized) {
    serialized = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) serialized += chunk;
  }
  const handoff = parseHandoff(serialized);
  if (!handoff) {
    // Intentionally not using `output.debug` as this command is called via a subprocess
    process.stderr.write('Failed to send telemetry events. Invalid handoff');
    return 1;
  }
  const { headers, body, invocationId, commandTrace } = handoff;
  const versionContext = await collectCachedVersionContextForTelemetry().catch(
    () => ({ status: 'error', source: 'detected' }) as const
  );
  const firstEvent = body[0];
  const contextEvents = [
    ...getVersionContextTelemetryEvents(versionContext),
    ...getConfigTelemetryEvents(client.config),
  ];
  for (const event of contextEvents) {
    body.push({
      id: randomUUID(),
      event_time: Date.now(),
      team_id: firstEvent?.team_id,
      user_id: firstEvent?.user_id,
      project_id: firstEvent?.project_id,
      ...event,
    });
  }

  const events = body.map(event =>
    // Include any context appended during flush without replacing an
    // event's explicit owner or inventing identity for legacy payloads.
    invocationId && event.invocation_id == null
      ? { ...event, invocation_id: invocationId }
      : event
  );
  const payload = commandTrace ? { version: 1, events, commandTrace } : events;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Awaited<ReturnType<typeof fetch>> | undefined;
  try {
    // Bypass client.fetch because telemetry bridge requests do not use the
    // authenticated Vercel API client.
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const status = response.status;
    const cliTracked = response.headers.get('x-vercel-cli-tracked') || '';
    const wasRecorded = cliTracked === '1';

    if (status === 204) {
      if (wasRecorded) {
        // Intentionally not using `output.debug` as this command is called via a subprocess
        process.stderr.write('Telemetry event tracked');
      } else {
        process.stderr.write('Telemetry event ignored');
      }
    } else {
      process.stderr.write(
        `Failed to send telemetry events. Unexpected response from telemetry server: ${status}`
      );
    }
    return 0;
  } catch (error) {
    if (error instanceof Error) {
      process.stderr.write(`Failed to send telemetry events. ${error.message}`);
    }
    return 1;
  } finally {
    void response?.body?.cancel().catch(() => undefined);
    clearTimeout(timeout);
  }
}
