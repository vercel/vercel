import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { connectSubcommand } from '../../../../commands/byoc/command';

export class ByocConnectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof connectSubcommand>
{
  trackCliOptionAwsAccountId(awsAccountId: string | undefined) {
    if (awsAccountId) {
      this.trackCliOption({
        option: 'aws-account-id',
        value: this.redactedValue,
      });
    }
  }
}
