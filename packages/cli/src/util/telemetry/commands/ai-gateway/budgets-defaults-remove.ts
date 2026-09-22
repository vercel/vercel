import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsDefaultsRemoveSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsDefaultsRemoveTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsDefaultsRemoveSubcommand>
{
  trackCliArgumentScope(scope: string | undefined) {
    if (scope) {
      this.trackCliArgument({ arg: 'scope', value: scope });
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
