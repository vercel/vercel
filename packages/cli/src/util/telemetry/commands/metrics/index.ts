import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { metricsCommand } from '../../../../commands/metrics/command';

export class MetricsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof metricsCommand>
{
  trackCliSubcommandQuery(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'query',
      value: actual,
    });
  }

  trackCliSubcommandSchema(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'schema',
      value: actual,
    });
  }

  trackCliOptionEvent(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'event',
        value,
      });
    }
  }

  trackCliOptionMeasure(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'measure',
        value,
      });
    }
  }

  trackCliOptionAggregation(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'aggregation',
        value,
      });
    }
  }

  trackCliOptionBy(value: string[] | undefined) {
    if (value && value.length > 0) {
      this.trackCliOption({
        option: 'by',
        value: value.join(','),
      });
    }
  }

  trackCliOptionLimit(value: number | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'limit',
        value: String(value),
      });
    }
  }

  trackCliOptionStatus(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'status',
        value,
      });
    }
  }

  trackCliOptionError(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'error',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionPath(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'path',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionMethod(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'method',
        value,
      });
    }
  }

  trackCliOptionRegion(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'region',
        value,
      });
    }
  }

  trackCliOptionFilter(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'filter',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSince(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'since',
        value,
      });
    }
  }

  trackCliOptionUntil(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'until',
        value,
      });
    }
  }

  trackCliOptionGranularity(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'granularity',
        value,
      });
    }
  }

  trackCliOptionProject(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEnvironment(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'environment',
        value,
      });
    }
  }

  trackCliOptionDeployment(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'deployment',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('json');
    }
  }

  trackCliFlagSummary(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('summary');
    }
  }
}
