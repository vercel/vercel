import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsInspectSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsInspectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsInspectSubcommand>
{
  trackCliArgumentScope(scope: string | undefined) {
    if (scope) {
      this.trackCliArgument({ arg: 'scope', value: scope });
    }
  }

  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({ arg: 'name', value: this.redactedValue });
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
