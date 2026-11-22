import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { describeSubcommand } from '../../../../commands/deploy/command';

export class DescribeTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof describeSubcommand>
{
  trackCliOptionDeployment(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'deployment', value: this.redactedValue });
    }
  }

  trackCliOptionId(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'id', value: this.redactedValue });
    }
  }

  trackCliOptionAwsAccountId(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'aws-account-id',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('json');
    }
  }
}
