import { TelemetryClient } from '../..';
import type { signedTokenSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobSignedTokenTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof signedTokenSubcommand>
{
  trackCliOptionPathname(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'pathname',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionOperation(value: string[] | undefined) {
    if (value && value.length > 0) {
      this.trackCliOption({
        option: 'operation',
        value: value.join(','),
      });
    }
  }

  trackCliOptionValidUntil(value: number | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'valid-until',
        value: String(value),
      });
    }
  }

  trackCliOptionAllowedContentType(value: string[] | undefined) {
    if (value && value.length > 0) {
      this.trackCliOption({
        option: 'allowed-content-type',
        value: value.join(','),
      });
    }
  }

  trackCliOptionMaximumSizeInBytes(value: number | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'maximum-size-in-bytes',
        value: String(value),
      });
    }
  }

  trackCliFlagJson(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('json');
    }
  }
}
