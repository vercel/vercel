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
export function checkGuidanceStatus({
  config,
  configStore,
  env = process.env,
}: {
  config: GlobalConfig;
  configStore?: CliConfigStore;
  env?: Readonly<Record<string, string | undefined>>;
}) {
  if (!env.FF_GUIDANCE_MODE) {
    // disabling guidance if not flagged into experimenting with it.
    return;
  }

  if (env.CI) {
    // disabling guidance initial enabling if in a CI environment
    // which includes Vercel's build container.
    return;
  }

  if (env.VERCEL_GUIDANCE_DISABLED) {
    // disabling guidance with the environment variable
    // implies the user has already been informed
    return;
  }

  if (config.guidance) {
    // telemetry has been set previously by this check of
    // user running vercel telemetry commands
    return;
  }

  output.note(
    'The Vercel CLI can suggest common follow-up commands and steps to help guide new users.'
  );
  output.log('You can disable this feature by running:');
  output.log('vercel guidance disable');
  output.log('or by setting VERCEL_GUIDANCE_DISABLED=1');

  config.guidance = {
    enabled: true,
  };

  if (configStore) {
    writeGlobalConfigOrThrow(configStore, config);
  } else {
    configFiles.writeToConfigFile(config);
  }
}
