import type { inspectSubcommand } from '../../../../commands/project/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class ProjectInspectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof inspectSubcommand>
{
  trackCliArgumentName(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'name',
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
