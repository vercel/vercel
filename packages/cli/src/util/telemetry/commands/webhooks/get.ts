import type { getSubcommand } from '../../../../commands/webhooks/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class WebhooksGetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof getSubcommand>
{
  trackCliArgumentId(id: string | undefined) {
    if (id) {
      this.trackCliArgument({
        arg: 'id',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({
        option: 'format',
        value: format,
      });
    }
  }
}
