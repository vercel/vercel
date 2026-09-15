import { TelemetryClient } from '../../../';
import type { TelemetryMethods } from '../../../types';
import {
  isRuleEnvironment,
  type RuleEnvironment,
} from '../../../../../commands/traces/config/rules';
import type { setSubcommand } from '../../../../../commands/traces/config/command';

export class TracesConfigSetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof setSubcommand>
{
  /**
   * The environment word is a closed set, so a valid value is tracked raw.
   * Anything else is a typo the CLI rejected and is redacted.
   */
  trackCliArgumentEnvironment(environment: string | undefined) {
    if (environment) {
      this.trackCliArgument({
        arg: 'environment',
        value: isRuleEnvironment(environment)
          ? (environment satisfies RuleEnvironment)
          : this.redactedValue,
      });
    }
  }

  trackCliArgumentRate(rate: string | undefined) {
    if (rate) {
      this.trackCliArgument({
        arg: 'rate',
        value: this.redactedValue,
      });
    }
  }

  /** The path prefix is customer data. */
  trackCliArgumentRequestPath(requestPath: string | undefined) {
    if (requestPath) {
      this.trackCliArgument({
        arg: 'requestPath',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
