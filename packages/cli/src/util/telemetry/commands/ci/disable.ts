import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { disableSubcommand } from '../../../../commands/ci/command';

export class CiDisableTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof disableSubcommand>
{
  trackCliOptionRemote(remote: string | undefined) {
    if (remote !== undefined) {
      this.trackCliOption({ option: 'remote', value: this.redactedValue });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
