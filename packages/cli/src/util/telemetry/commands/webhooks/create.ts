import type { createSubcommand } from '../../../../commands/webhooks/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class WebhooksCreateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof createSubcommand>
{
  trackCliArgumentUrl(url: string | undefined) {
    if (url) {
      this.trackCliArgument({
        arg: 'url',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEvent(events: string[] | undefined) {
    if (events && events.length > 0) {
      this.trackCliOption({
        option: 'event',
        value: String(events.length),
      });
    }
  }

  trackCliOptionProject(projects: string[] | undefined) {
    if (projects && projects.length > 0) {
      this.trackCliOption({
        option: 'project',
        value: String(projects.length),
      });
    }
  }
}
