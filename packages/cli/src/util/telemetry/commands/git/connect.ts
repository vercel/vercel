import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { connectSubcommand } from '../../../../commands/git/command';

export class GitConnectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof connectSubcommand>
{
  trackCliArgumentGitUrl(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'gitUrl',
        value: this.redactedValue,
      });
    }
  }

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
