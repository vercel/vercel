import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { inspectSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayApiKeysInspectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof inspectSubcommand>
{
  trackCliArgumentId(id: string | undefined) {
    if (id) {
      this.trackCliArgument({ arg: 'id', value: this.redactedValue });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }
}
