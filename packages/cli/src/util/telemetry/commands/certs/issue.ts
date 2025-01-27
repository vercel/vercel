import { CertsAddTelemetryClient } from './add';
import type { TelemetryMethods } from '../../types';
import type { issueSubcommand } from '../../../../commands/certs/command';

export class CertsIssueTelemetryClient
  extends CertsAddTelemetryClient
  implements TelemetryMethods<typeof issueSubcommand>
{
  trackCliArgumentCn(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'cn',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagChallengeOnly(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('challenge-only');
    }
  }
}
