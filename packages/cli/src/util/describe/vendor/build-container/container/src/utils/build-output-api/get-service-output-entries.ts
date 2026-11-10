// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import type {
  BuildOutputConfig,
  ExperimentalServicesV2WithBindings,
} from './build-output-config';
import { join } from 'path';

export interface ServiceOutputEntry {
  directory: string;
  name: string;
  service: ExperimentalServicesV2WithBindings[string];
}

export function getServiceOutputEntries(
  config: Pick<BuildOutputConfig, 'experimentalServicesV2'>
): ServiceOutputEntry[] {
  return Object.entries(config.experimentalServicesV2 ?? {}).map(
    ([name, service]) => ({
      name,
      directory: join('services', name),
      service,
    })
  );
}
