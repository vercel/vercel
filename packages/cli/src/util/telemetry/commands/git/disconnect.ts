import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { disconnectSubcommand } from '../../../../commands/git/command';

export class GitDisconnectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof disconnectSubcommand>
{
  trackCliFlagConfirm(confirm: boolean | undefined) {
    if (confirm) {
      this.trackCliFlag('confirm');
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
