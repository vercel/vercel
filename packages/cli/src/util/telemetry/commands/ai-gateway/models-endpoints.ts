import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { modelsEndpointsSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayModelsEndpointsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof modelsEndpointsSubcommand>
{
  trackCliArgumentModel(model: string | undefined) {
    if (model) {
      this.trackCliArgument({ arg: 'model', value: this.redactedValue });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }
}
