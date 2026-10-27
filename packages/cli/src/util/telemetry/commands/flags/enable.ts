import { TelemetryClient } from '../..';
import {
  STANDARD_ENVIRONMENTS,
  type StandardEnvironment,
} from '../../../target/standard-environments';
import type { enableSubcommand } from '../../../../commands/flags/command';
import type { TelemetryMethods } from '../../types';
export class FlagsEnableTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof enableSubcommand>
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

  trackCliOptionMessage(message: string | undefined) {
    if (message) {
      this.trackCliOption({
        option: 'message',
        value: this.redactedValue,
      });
    }
  }
}
