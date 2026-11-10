import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { balanceSubcommand } from '../../../../commands/integration/command';

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

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
