import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { logsInspectSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayLogsInspectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof logsInspectSubcommand>
{
  trackCliArgumentGenerationId(value?: string) {
    if (value) {
      this.trackCliArgument({ arg: 'generationId', value: this.redactedValue });
    }
  }

  trackCliOptionFormat(value?: string) {
    if (value) this.trackCliOption({ option: 'format', value });
  }

  trackCliFlagJson(value?: boolean) {
    if (value) this.trackCliFlag('json');
  }
}
