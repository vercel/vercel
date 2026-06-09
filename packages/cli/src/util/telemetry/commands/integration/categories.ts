import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { categoriesSubcommand } from '../../../../commands/integration/command';

export class IntegrationCategoriesTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof categoriesSubcommand>
{
  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }
}
