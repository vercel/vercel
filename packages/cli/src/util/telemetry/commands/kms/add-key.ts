import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { addKeySubcommand } from '../../../../commands/kms/command';

export class KmsAddKeyTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addKeySubcommand>
{
  trackCliArgumentIssuerId(issuerId: string | undefined) {
    if (issuerId) {
      this.trackCliArgument({
        arg: 'issuerId',
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
