import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rulesCreateSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayRulesCreateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rulesCreateSubcommand>
{
  trackCliOptionType(type: string | undefined) {
    if (type) {
      this.trackCliOption({ option: 'type', value: type });
    }
  }

  trackCliOptionModel(model: string | undefined) {
    if (model) {
      this.trackCliOption({ option: 'model', value: this.redactedValue });
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
