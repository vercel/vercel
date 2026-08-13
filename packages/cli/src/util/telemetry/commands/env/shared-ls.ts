import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { sharedListSubcommand } from '../../../../commands/env/command';

export class EnvSharedLsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof sharedListSubcommand>
{
  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({
        option: 'format',
        value: format,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit) {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionNext(next: number | undefined) {
    if (next) {
      this.trackCliOption({
        option: 'next',
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
}
