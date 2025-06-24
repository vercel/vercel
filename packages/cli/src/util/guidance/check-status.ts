import type { GlobalConfig } from '@vercel-internals/types';
import * as configFiles from '../config/files';

import output from '../../output-manager';

export function checkTelemetryStatus({ config }: { config: GlobalConfig }) {
  if (!process.env.FF_GUIDANCE_MODE) {
    return;
  }

  if (config.guidance) {
    // telemetry has been set previously by this check of
    // user running vercel telemetry commands
    return;
  }

  if (process.env.VERCEL_GUIDANCE_DISABLED) {
    // disabling guidance with the environment variable
    // implies the user has already been informed
    return;
  }

  output.note(
    'The Vercel CLI can suggest common follow-up commands and steps to help guide new users.'
  );
  output.log('You cand disable this feature by running:');
  output.log('vercel guidance disable');
  output.log('or by setting VERCEL_GUIDANCE_DISABLED=1');

  config.guidance = {
    enabled: true,
  };

  configFiles.writeToConfigFile(config);
}
