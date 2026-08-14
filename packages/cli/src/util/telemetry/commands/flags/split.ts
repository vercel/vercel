import { TelemetryClient } from '../..';
import { STANDARD_ENVIRONMENTS } from '../../../target/standard-environments';
import type { splitSubcommand } from '../../../../commands/flags/command';
import type { TelemetryMethods } from '../../types';

type StandardEnvironment = (typeof STANDARD_ENVIRONMENTS)[number];

export class FlagsSplitTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof splitSubcommand>
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

  trackCliOptionBy(base: string | undefined) {
    if (base) {
      this.trackCliOption({
        option: 'by',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionWeight(weights: [string] | undefined) {
    if (weights?.length) {
      this.trackCliOption({
        option: 'weight',
        value: this.redactedValue,
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
}
