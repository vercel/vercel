import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rulesEditSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayRulesEditTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rulesEditSubcommand>
{
  trackCliArgumentRuleId(ruleId: string | undefined) {
    if (ruleId) {
      this.trackCliArgument({ arg: 'ruleId', value: this.redactedValue });
    }
  }

  trackCliFlagEnable(enable: boolean | undefined) {
    if (enable) {
      this.trackCliFlag('enable');
    }
  }

  trackCliFlagDisable(disable: boolean | undefined) {
    if (disable) {
      this.trackCliFlag('disable');
    }
  }

  trackCliOptionDestination(destination: string | undefined) {
    if (destination) {
      this.trackCliOption({
        option: 'destination',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionReason(reason: string | undefined) {
    if (reason) {
      this.trackCliOption({ option: 'reason', value: this.redactedValue });
    }
  }

  trackCliOptionDescription(description: string | undefined) {
    if (description) {
      this.trackCliOption({ option: 'description', value: this.redactedValue });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }
}
