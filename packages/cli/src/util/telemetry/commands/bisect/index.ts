import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { bisectCommand } from '../../../../commands/bisect/command';

export class BisectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof bisectCommand>
{
  trackCliOptionGood(good: string | undefined) {
    if (good) {
      this.trackCliOption({
        option: 'good',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionBad(bad: string | undefined) {
    if (bad) {
      this.trackCliOption({
        option: 'bad',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionPath(path: string | undefined) {
    if (path) {
      this.trackCliOption({
        option: 'path',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRun(run: string | undefined) {
    if (run) {
      this.trackCliOption({
        option: 'run',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagOpen(open: boolean | undefined) {
    if (open) {
      this.trackCliFlag('open');
    }
  }
}
