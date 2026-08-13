import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { inspectSubcommand } from '../../../../commands/target/command';

export class TargetInspectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof inspectSubcommand>
{
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
