import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rulesAddSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayRulesAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rulesAddSubcommand>
{
  trackCliOptionType(type: string | undefined) {
    if (type) {
      this.trackCliOption({ option: 'type', value: type });
    }
  }

  trackCliOptionSource(source: string | undefined) {
    if (source) {
      this.trackCliOption({ option: 'source', value: this.redactedValue });
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
