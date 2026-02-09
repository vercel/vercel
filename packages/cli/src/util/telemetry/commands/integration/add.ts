import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { addSubcommand } from '../../../../commands/integration/command';

export class IntegrationAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
{
  trackCliArgumentIntegration(v: string | undefined, known?: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'integration',
        value: known ? v : this.redactedValue,
      });
    }
  }

  trackCliOptionName(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'name',
        value: this.redactedValue,
      });
    }
  }
}
