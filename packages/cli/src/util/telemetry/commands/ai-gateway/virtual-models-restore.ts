import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { virtualModelsRestoreSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayVirtualModelsRestoreTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof virtualModelsRestoreSubcommand>
{
  trackCliArgumentSlug(slug: string | undefined) {
    if (slug) {
      this.trackCliArgument({ arg: 'slug', value: this.redactedValue });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
