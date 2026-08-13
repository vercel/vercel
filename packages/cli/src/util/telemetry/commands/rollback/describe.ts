import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { describeSubcommand } from '../../../../commands/rollback/command';

export class RollbackDescribeTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof describeSubcommand>
{
  trackCliArgumentUrlOrDeploymentId(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'urlOrDeploymentId',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionDescription(description: string | undefined) {
    if (description) {
      this.trackCliOption({
        option: 'description',
        value: this.redactedValue,
      });
    }
  }
}
