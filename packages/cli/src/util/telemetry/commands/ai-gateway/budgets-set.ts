import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { budgetsSetSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayBudgetsSetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof budgetsSetSubcommand>
{
  trackCliOptionProject(project: string | undefined) {
    if (project) {
      this.trackCliOption({ option: 'project', value: this.redactedValue });
    }
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit !== undefined) {
      this.trackCliOption({ option: 'limit', value: this.redactedValue });
    }
  }

  trackCliOptionRefreshPeriod(refreshPeriod: string | undefined) {
    if (refreshPeriod) {
      this.trackCliOption({ option: 'refresh-period', value: refreshPeriod });
    }
  }

  trackCliFlagIncludeByok(includeByok: boolean | undefined) {
    if (includeByok) {
      this.trackCliFlag('include-byok');
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }
}
