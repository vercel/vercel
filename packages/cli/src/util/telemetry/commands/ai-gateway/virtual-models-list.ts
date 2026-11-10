import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { virtualModelsListSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayVirtualModelsListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof virtualModelsListSubcommand>
{
  trackCliFlagIncludeArchived(includeArchived: boolean | undefined) {
    if (includeArchived) {
      this.trackCliFlag('include-archived');
    }
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit !== undefined) {
      this.trackCliOption({ option: 'limit', value: String(limit) });
    }
  }

  trackCliOptionNext(next: string | undefined) {
    if (next) {
      this.trackCliOption({ option: 'next', value: this.redactedValue });
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
