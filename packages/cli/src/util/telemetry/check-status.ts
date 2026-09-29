import type { GlobalConfig } from '@vercel-internals/types';
import * as configFiles from '../config/files';

import output from '../../output-manager';
import {
  type CliConfigStore,
  writeGlobalConfigOrThrow,
} from '../../gateways/cli-config-store';

/**
 * @param configStore Where to persist the updated config. Defaults to the
 * import-time global config file.
 * @param env Invocation environment. Defaults to `process.env`.
 */
export function checkTelemetryStatus({
  config,
  configStore,
  env = process.env,
}: {
  config: GlobalConfig;
  configStore?: CliConfigStore;
  env?: Readonly<Record<string, string | undefined>>;
}) {
  if (config.telemetry) {
    // telemetry has been set previously by this check of
    // user running vercel telemetry commands
    return;
  }

  if (env.VERCEL_TELEMETRY_DISABLED) {
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

  if (configStore) {
    writeGlobalConfigOrThrow(configStore, config);
  } else {
    configFiles.writeToConfigFile(config);
  }
}
