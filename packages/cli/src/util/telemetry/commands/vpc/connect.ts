import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { connectSubcommand } from '../../../../commands/vpc/command';

export class VpcConnectTelemetryClient
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
