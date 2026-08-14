import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { getSubcommand } from '../../../../commands/traces/command';

export class TracesTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof getSubcommand>
{
  trackCliArgumentRequestId(requestId: string | undefined) {
    if (requestId) {
      this.trackCliArgument({
        arg: 'requestId',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }

  trackCliOptionProject(project: string | undefined) {
    if (project) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagOpen(open: boolean | undefined) {
    if (open) {
      this.trackCliFlag('open');
    }
  }

  trackCliOptionView(view: string | undefined) {
    if (view) {
      this.trackCliOption({
        option: 'view',
        value: view,
      });
    }
  }
}
