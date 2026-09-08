import { TelemetryClient } from '../..';
import { STANDARD_ENVIRONMENTS } from '../../../target/standard-environments';
import type { useTargetingSubcommand } from '../../../../commands/flags/command';
import type { TelemetryMethods } from '../../types';

type StandardEnvironment = (typeof STANDARD_ENVIRONMENTS)[number];

export class FlagsUseTargetingTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof useTargetingSubcommand>
{
  trackCliArgumentFlag(flag: string | undefined) {
    if (flag) {
      this.trackCliArgument({
        arg: 'flag',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEnvironment(environment: string | undefined) {
    if (environment) {
      this.trackCliOption({
        option: 'environment',
        value: STANDARD_ENVIRONMENTS.includes(
          environment as StandardEnvironment
        )
          ? environment
          : this.redactedValue,
      });
    }
  }

  trackCliOptionDefaultVariant(variant: string | undefined) {
    if (variant) {
      this.trackCliOption({
        option: 'default-variant',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionMessage(message: string | undefined) {
    if (message) {
      this.trackCliOption({
        option: 'message',
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
