import type { GlobalConfig } from '@vercel-internals/types';
import * as configFiles from '../config/files';

import output from '../../output-manager';

export function checkTelemetryStatus({ config }: { config: GlobalConfig }) {
  if (config.telemetry) {
    // telemetry has been set previously by this check of
    // user running vercel telemetry commands
    return;
  }

  if (process.env.VERCEL_TELEMETRY_DISABLED) {
    // disabling telemetry with the environment variable
    // implies the user has already been informed
    return;
  }

  output.note(
    'The Vercel CLI now collects telemetry regarding usage of the CLI.'
  );
  output.log(
    'This information is used to shape the CLI roadmap and prioritize features.'
  );
  output.log(
    "You can learn more, including how to opt-out if you'd not like to participate in this program, by visiting the following URL:"
  );
  output.log('https://vercel.com/docs/cli/about-telemetry');

  config.telemetry = {
    enabled: true,
  };

  configFiles.writeToConfigFile(config);
}
