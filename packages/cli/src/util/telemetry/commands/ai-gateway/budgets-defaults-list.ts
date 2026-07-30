import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsDefaultsListSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsDefaultsListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsDefaultsListSubcommand>
{
  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }
}
