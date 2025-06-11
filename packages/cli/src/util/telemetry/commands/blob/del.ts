import { TelemetryClient } from '../..';
import type { delSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobDelTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof delSubcommand>
{
  trackCliArgumentUrlsOrPathnames(urlsOrPathnames: string | undefined) {
    if (urlsOrPathnames) {
      this.trackCliArgument({
        arg: 'urlsOrPathnames',
        value: this.redactedValue,
      });
    }
  }
}
