import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsListSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsListSubcommand>
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

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }

  trackCliOptionScopeType(scopeType: string | undefined) {
    if (scopeType) {
      this.trackCliOption({ option: 'scope-type', value: scopeType });
    }
  }

  trackCliFlagDefaults(defaults: boolean | undefined) {
    if (defaults) {
      this.trackCliFlag('defaults');
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
