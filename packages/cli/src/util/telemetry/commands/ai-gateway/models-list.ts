import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { modelsListSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayModelsListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof modelsListSubcommand>
{
  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }
}
