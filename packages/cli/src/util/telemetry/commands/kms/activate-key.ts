import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { activateKeySubcommand } from '../../../../commands/kms/command';

export class KmsActivateKeyTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof activateKeySubcommand>
{
  trackCliArgumentIssuerId(issuerId: string | undefined) {
    if (issuerId) {
      this.trackCliArgument({
        arg: 'issuerId',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentKeyId(keyId: string | undefined) {
    if (keyId) {
      this.trackCliArgument({
        arg: 'keyId',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRevokePreviousAfterHours(hours: number | undefined) {
    if (hours !== undefined) {
      this.trackCliOption({
        option: 'revoke-previous-after-hours',
        value: String(hours),
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

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
