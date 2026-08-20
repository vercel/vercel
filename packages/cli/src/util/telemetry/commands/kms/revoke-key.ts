import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { revokeKeySubcommand } from '../../../../commands/kms/command';

export class KmsRevokeKeyTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof revokeKeySubcommand>
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

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
