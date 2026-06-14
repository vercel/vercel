import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rulesDeleteSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayRulesDeleteTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rulesDeleteSubcommand>
{
  trackCliArgumentRuleId(ruleId: string | undefined) {
    if (ruleId) {
      this.trackCliArgument({ arg: 'ruleId', value: this.redactedValue });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }
}
