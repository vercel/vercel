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

  /**
   * Note: `--scope` is a global flag and tracked at the CLI root via the
   * root telemetry client. This method exists for callers that want to
   * record the scope at the subcommand level (e.g. when surfacing it in
   * subcommand-specific telemetry).
   */
  trackCliOptionScope(scope: string | undefined) {
    if (scope) {
      this.trackCliOption({
        option: 'scope',
        value: this.redactedValue,
      });
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

  trackCliOptionTimeout(value: number | undefined) {
    if (typeof value === 'number') {
      this.trackCliOption({
        option: 'timeout',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagNoWait(noWait: boolean | undefined) {
    if (noWait) {
      this.trackCliFlag('no-wait');
    }
  }
}
