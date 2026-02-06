import type { balanceSubcommand } from '../../../../commands/integration/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class IntegrationBalanceTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof balanceSubcommand>
{
  trackCliArgumentIntegration(v: string | undefined, known?: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'name',
        value: known ? v : this.redactedValue,
      });
    }
  }
}
