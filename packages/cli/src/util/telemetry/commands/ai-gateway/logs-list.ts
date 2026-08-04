import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { logsListSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayLogsListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof logsListSubcommand>
{
  trackCliOptionProject(value?: string) {
    if (value)
      this.trackCliOption({ option: 'project', value: this.redactedValue });
  }
  trackCliOptionSince(value?: string) {
    if (value)
      this.trackCliOption({ option: 'since', value: this.redactedValue });
  }
  trackCliOptionUntil(value?: string) {
    if (value)
      this.trackCliOption({ option: 'until', value: this.redactedValue });
  }
  trackCliOptionProvider(value?: string) {
    if (value)
      this.trackCliOption({ option: 'provider', value: this.redactedValue });
  }
  trackCliOptionModel(value?: string) {
    if (value)
      this.trackCliOption({ option: 'model', value: this.redactedValue });
  }
  trackCliOptionStatus(value?: string) {
    if (value) this.trackCliOption({ option: 'status', value });
  }
  trackCliOptionPage(value?: number) {
    if (value !== undefined)
      this.trackCliOption({ option: 'page', value: this.redactedValue });
  }
  trackCliOptionLimit(value?: number) {
    if (value !== undefined)
      this.trackCliOption({ option: 'limit', value: this.redactedValue });
  }
  trackCliOptionFormat(value?: string) {
    if (value) this.trackCliOption({ option: 'format', value });
  }
}
