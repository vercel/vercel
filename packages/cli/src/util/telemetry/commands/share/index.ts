import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { shareCommand } from '../../../../commands/share/command';

export class ShareTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof shareCommand>
{
  trackCliFlagYes(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('yes');
    }
  }

  trackCliArgumentUrlOrDeploymentId(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'deploymentIdOrHost',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTtl(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'ttl',
        value: this.redactedValue,
      });
    }
  }
}
