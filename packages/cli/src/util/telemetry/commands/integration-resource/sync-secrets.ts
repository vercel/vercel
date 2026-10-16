import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { syncSecretsSubcommand } from '../../../../commands/integration-resource/command';

export class IntegrationResourceSyncSecretsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof syncSecretsSubcommand>
{
  trackCliArgumentResource(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'resource',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagOverwriteConflicts(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('overwrite-conflicts');
    }
  }

  trackCliFlagDryRun(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('dry-run');
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
