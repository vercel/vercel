import { TelemetryClient } from '../..';
import type { datafileSubcommand } from '../../../../commands/flags/command';
import type { TelemetryMethods } from '../../types';

export class FlagsDatafileTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof datafileSubcommand>
{
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

  trackCliOptionEnvironment(environment: string | undefined) {
    if (environment) {
      this.trackCliOption({
        option: 'environment',
        value: environment,
      });
    }
  }

  trackCliFlagSdkKey(sdkKey: boolean | undefined) {
    if (sdkKey) {
      this.trackCliFlag('sdk-key');
    }
  }
}
