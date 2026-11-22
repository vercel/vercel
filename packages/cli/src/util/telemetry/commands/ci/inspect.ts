import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { inspectSubcommand } from '../../../../commands/ci/command';

export class CiInspectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof inspectSubcommand>
{
  trackCliArgumentRun(run: string | undefined) {
    if (run) {
      this.trackCliArgument({ arg: 'run', value: this.redactedValue });
    }
  }

  trackCliOptionAttempt(attempt: number | undefined) {
    if (attempt !== undefined) {
      this.trackCliOption({ option: 'attempt', value: String(attempt) });
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
