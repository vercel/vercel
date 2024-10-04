import { GlobalConfig } from '@vercel-internals/types';
import * as configFiles from '../config/files';
import Client from '../client';

export function checkTelemetryStatus({
  config,
  client,
}: {
  config: GlobalConfig;
  client: Client;
}) {
  if (config.telemetry) {
    // telemetry has been set previously by this check of
    // user running vercel telemetry commands
    return;
  }

  client.output.note('The Vercel CLI now collects telemetry regarding usage.');
  client.output.log(
    'This information is used to shape the CLI roadmap and prioritize features.'
  );
  client.output.log(
    "You can learn more, including how to opt-out if you'd not like to participate in this program, by visiting the following URL:"
  );
  client.output.log('https://vercel.com/docs/cli/about-telemerty');

  config.telemetry = {
    enabled: true,
  };

  configFiles.writeToConfigFile(client.output, config);
}
