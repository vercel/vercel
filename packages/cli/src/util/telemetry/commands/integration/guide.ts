import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { guideSubcommand } from '../../../../commands/integration/command';

export class IntegrationGuideTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof guideSubcommand>
{
  trackCliArgumentIntegration(v: string | undefined, known?: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'integration',
        value: known ? v : this.redactedValue,
      });
    }
  }

  trackCliOptionFramework(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'framework',
        value: this.redactedValue,
      });
    }
  }
}
