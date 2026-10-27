import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rerunSubcommand } from '../../../../commands/ci/command';

export class CiRerunTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rerunSubcommand>
{
  trackCliArgumentRun(run: string | undefined) {
    if (run) {
      this.trackCliArgument({ arg: 'run', value: this.redactedValue });
    }
  }

  trackCliFlagWait(wait: boolean | undefined) {
    if (wait) {
      this.trackCliFlag('wait');
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
