import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { rulesListSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayRulesListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof rulesListSubcommand>
{
  trackCliFlagIncludeDisabled(includeDisabled: boolean | undefined) {
    if (includeDisabled) {
      this.trackCliFlag('include-disabled');
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }
}
