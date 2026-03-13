import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { termsSubcommand } from '../../../../commands/integration/command';

export class IntegrationTermsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof termsSubcommand>
{
  trackCliArgumentIntegration(v: string | undefined, known?: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'integration',
        value: known ? v : this.redactedValue,
      });
    }
  }

  trackCliFlagAccept(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('accept');
    }
  }
}
