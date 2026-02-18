import { TelemetryClient } from '../..';
import type { getSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobGetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof getSubcommand>
{
  trackCliArgumentUrlOrPathname(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'urlOrPathname',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionAccess(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'access',
        value,
      });
    }
  }

  trackCliOptionOutput(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'output',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionIfNoneMatch(ifNoneMatch: string | undefined) {
    if (ifNoneMatch) {
      this.trackCliOption({
        option: 'if-none-match',
        value: this.redactedValue,
      });
    }
  }
}
