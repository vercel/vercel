import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { getSubcommand } from '../../../../commands/traces/command';

export class TracesTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof getSubcommand>
{
  trackCliArgumentId(
    id: string | undefined,
    kind: 'requestId' | 'traceId' = 'requestId'
  ) {
    if (id) {
      this.trackCliArgument({
        arg: kind,
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }

  trackCliOptionProject(project: string | undefined) {
    if (project) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagOpen(open: boolean | undefined) {
    if (open) {
      this.trackCliFlag('open');
    }
  }

  trackCliSubcommandConfig(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'config',
      value: actual,
    });
  }

  trackCliSubcommandSearch(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'search',
      value: actual,
    });
  }

  trackCliOptionEnvironment(value: string | undefined) {
    this.trackRedactedOption('environment', value);
  }

  trackCliOptionService(value: string | undefined) {
    this.trackRedactedOption('service', value);
  }

  trackCliOptionName(value: string | undefined) {
    this.trackRedactedOption('name', value);
  }

  trackCliOptionKind(value: string | undefined) {
    this.trackRedactedOption('kind', value);
  }

  trackCliOptionStatus(value: string | undefined) {
    this.trackRedactedOption('status', value);
  }

  trackCliOptionDeployment(value: string | undefined) {
    this.trackRedactedOption('deployment', value);
  }

  trackCliOptionDeploymentId(value: string | undefined) {
    this.trackRedactedOption('deployment-id', value);
  }

  trackCliOptionRequestId(value: string | undefined) {
    this.trackRedactedOption('request-id', value);
  }

  trackCliOptionTrace(value: string | undefined) {
    this.trackRedactedOption('trace', value);
  }

  // The deprecated name keeps its own key, to measure who still uses it.
  trackCliOptionTraceId(value: string | undefined) {
    this.trackRedactedOption('trace-id', value);
  }

  trackCliOptionSpan(value: string | undefined) {
    this.trackRedactedOption('span', value);
  }

  // The deprecated name keeps its own key, to measure who still uses it.
  trackCliOptionSpanId(value: string | undefined) {
    this.trackRedactedOption('span-id', value);
  }

  trackCliFlagRoot(root: boolean | undefined) {
    if (root) {
      this.trackCliFlag('root');
    }
  }

  trackCliOptionSince(value: string | undefined) {
    this.trackRedactedOption('since', value);
  }

  trackCliOptionUntil(value: string | undefined) {
    this.trackRedactedOption('until', value);
  }

  trackCliOptionLimit(value: number | undefined) {
    if (value !== undefined) {
      this.trackCliOption({ option: 'limit', value: this.redactedValue });
    }
  }

  trackCliOptionQuery(value: string | undefined) {
    this.trackRedactedOption('query', value);
  }

  trackCliOptionColumns(value: string | undefined) {
    this.trackRedactedOption('columns', value);
  }

  trackCliOptionNext(value: string | undefined) {
    this.trackRedactedOption('next', value);
  }

  private trackRedactedOption(option: string, value: string | undefined) {
    if (value !== undefined) {
      this.trackCliOption({ option, value: this.redactedValue });
    }
  }

  trackCliOptionView(view: string | undefined) {
    if (view) {
      this.trackCliOption({
        option: 'view',
        value: view,
      });
    }
  }
}
