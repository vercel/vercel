import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { enableSubcommand } from '../../../../commands/ci/command';

export class CiEnableTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof enableSubcommand>
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
