import type { listSubcommand } from '../../../../commands/webhooks/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class WebhooksLsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listSubcommand>
{
  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({
        option: 'format',
        value: format,
      });
    }
  }
}
