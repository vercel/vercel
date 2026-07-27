import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsDefaultsInspectSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsDefaultsInspectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsDefaultsInspectSubcommand>
{
  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }
}
