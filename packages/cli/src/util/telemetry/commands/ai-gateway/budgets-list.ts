import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsListSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsListSubcommand>
{
  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }
}
