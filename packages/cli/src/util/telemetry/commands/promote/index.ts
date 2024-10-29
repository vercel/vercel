import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { promoteCommand } from '../../../../commands/promote/command';

export class PromoteTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof promoteCommand>
{
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
