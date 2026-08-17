import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { importKeySubcommand } from '../../../../commands/kms/command';

export class KmsImportKeyTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof importKeySubcommand>
{
  trackCliArgumentIssuerId(issuerId: string | undefined) {
    if (issuerId) {
      this.trackCliArgument({
        arg: 'issuerId',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionKey(key: string | undefined) {
    if (key) {
      this.trackCliOption({
        option: 'key',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionKeyId(keyId: string | undefined) {
    if (keyId) {
      this.trackCliOption({
        option: 'key-id',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionActivation(activation: string | undefined) {
    if (activation) {
      this.trackCliOption({
        option: 'activation',
        value: activation,
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
