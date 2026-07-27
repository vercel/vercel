import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsRemoveSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsRemoveTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsRemoveSubcommand>
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
