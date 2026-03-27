import type Client from '../../util/client';
import type { DevTelemetryClient } from '../../util/telemetry/commands/dev';
import { startAgentMode } from './agent';
import { startDevServer, type DevOptions } from './dev-server';

export default async function dev(
  client: Client,
  opts: Partial<DevOptions>,
  args: string[],
  telemetry: DevTelemetryClient
) {
  if (opts['--agent']) {
    return startAgentMode(client, opts, args, telemetry);
  }
  return startDevServer(client, opts, args, telemetry);
}
