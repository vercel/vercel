import type { promoteCommand } from '../../../../commands/promote/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class PromoteTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof promoteCommand>
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
