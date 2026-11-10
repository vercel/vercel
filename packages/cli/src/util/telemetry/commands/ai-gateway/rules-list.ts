import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rulesListSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayRulesListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rulesListSubcommand>
{
  trackCliOptionLimit(limit: number | undefined) {
    if (limit !== undefined) {
      this.trackCliOption({ option: 'limit', value: String(limit) });
    }
  }

  trackCliOptionNext(next: string | undefined) {
    if (next) {
      this.trackCliOption({ option: 'next', value: this.redactedValue });
    }
  }

  trackCliFlagIncludeDisabled(includeDisabled: boolean | undefined) {
    if (includeDisabled) {
      this.trackCliFlag('include-disabled');
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
