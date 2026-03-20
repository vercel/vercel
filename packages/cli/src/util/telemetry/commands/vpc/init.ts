import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { initSubcommand } from '../../../../commands/vpc/command';

export class VpcInitTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof initSubcommand>
{
  trackCliOptionAwsAccountId(awsAccountId: string | undefined) {
    if (awsAccountId) {
      this.trackCliOption({
        option: 'aws-account-id',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRoleName(roleName: string | undefined) {
    if (roleName) {
      this.trackCliOption({
        option: 'role-name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionExternalId(externalId: string | undefined) {
    if (externalId) {
      this.trackCliOption({
        option: 'external-id',
        value: this.redactedValue,
      });
    }
  }
}
