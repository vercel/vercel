import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rollbackCommand } from '../../../../commands/rollback/command';

export class RollbackTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rollbackCommand>
{
  trackCliArgumentUrlOrDeploymentId(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'urlOrDeploymentId',
        value: this.redactedValue,
      });
    }
  }

  trackCliSubcommandStatus() {
    this.trackCliSubcommand({
      subcommand: 'status',
      value: 'status',
    });
  }

  trackCliOptionTimeout(time: string | undefined) {
    if (time) {
      this.trackCliOption({
        option: 'timeout',
        value: '[TIME]',
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
