import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rulesUpdateSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayRulesUpdateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rulesUpdateSubcommand>
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

  trackCliOptionRewriteModel(rewriteModel: string | undefined) {
    if (rewriteModel) {
      this.trackCliOption({
        option: 'rewrite-model',
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
