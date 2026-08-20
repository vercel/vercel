import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { removeGrantSubcommand } from '../../../../commands/kms/command';

export class KmsRmGrantTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeGrantSubcommand>
{
  trackCliArgumentIssuerId(issuerId: string | undefined) {
    if (issuerId) {
      this.trackCliArgument({
        arg: 'issuerId',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentProjectId(projectId: string | undefined) {
    if (projectId) {
      this.trackCliArgument({
        arg: 'projectId',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
