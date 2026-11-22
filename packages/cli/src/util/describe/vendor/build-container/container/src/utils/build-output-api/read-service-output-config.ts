// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import type { BuildOutputConfig } from './build-output-config';
import type { ServiceOutputEntry } from './get-service-output-entries';
import { NowBuildError } from '@vercel/build-utils';
import { getBuildOutputConfig } from './get-build-output-config';
import { join } from 'path';

export async function readServiceOutputConfig(
  outputDir: string,
  entry: ServiceOutputEntry
): Promise<BuildOutputConfig | undefined> {
  const config = await getBuildOutputConfig(join(outputDir, entry.directory));
  if (!config && entry.service.root === undefined) {
    throw new NowBuildError({
      code: 'MISSING_SERVICE_BUILD_OUTPUT',
      message: `Service "${entry.name}" is configured in experimentalServicesV2 but is missing build output at ".vercel/output/services/${entry.name}/config.json".`,
    });
  }
  return config;
}
