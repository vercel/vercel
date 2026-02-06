import type { removeSubcommand } from '../../../../commands/webhooks/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class WebhooksRmTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeSubcommand>
{
  trackCliArgumentId(id: string | undefined) {
    if (id) {
      this.trackCliArgument({
        arg: 'id',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
