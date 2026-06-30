import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { claimSubcommand } from '../../../../commands/integration-resource/command';

export class IntegrationResourceClaimTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof claimSubcommand>
{
  trackCliArgumentResource(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'resource',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagNoWait(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('no-wait');
    }
  }
}
