import { TelemetryClient } from '../..';
import type { copySubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobCopyTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof copySubcommand>
{
  trackCliOptionAccess(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'access',
        value,
      });
    }
  }

  trackCliArgumentFromUrlOrPathname(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'fromUrlOrPathname',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentToPathname(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'toPathname',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagAddRandomSuffix(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('add-random-suffix');
    }
  }

  trackCliOptionContentType(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'content-type',
        value,
      });
    }
  }

  trackCliOptionCacheControlMaxAge(value: number | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'cache-control-max-age',
        value: String(value),
      });
    }
  }

  trackCliOptionIfMatch(ifMatch: string | undefined) {
    if (ifMatch) {
      this.trackCliOption({
        option: 'if-match',
        value: this.redactedValue,
      });
    }
  }
}
