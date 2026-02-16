import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { metricsCommand } from '../../../../commands/metrics/command';

export class MetricsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof metricsCommand>
{
  trackCliSubcommandQuery(v: string | undefined) {
    if (v) {
      this.trackCliSubcommand({
        subcommand: 'query',
        value: v,
      });
    }
  }

  trackCliSubcommandSchema(v: string | undefined) {
    if (v) {
      this.trackCliSubcommand({
        subcommand: 'schema',
        value: v,
      });
    }
  }

  trackCliOptionEvent(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'event',
        value: v,
      });
    }
  }

  trackCliOptionMeasure(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'measure',
        value: v,
      });
    }
  }

  trackCliOptionAggregation(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'aggregation',
        value: v,
      });
    }
  }

  trackCliOptionGroupBy(v: string[] | undefined) {
    if (v && v.length > 0) {
      this.trackCliOption({
        option: 'group-by',
        value: v.join(','),
      });
    }
  }

  trackCliOptionLimit(v: number | undefined) {
    if (typeof v === 'number') {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionOrderBy(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'order-by',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionFilter(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'filter',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSince(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'since',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionUntil(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'until',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionGranularity(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'granularity',
        value: v,
      });
    }
  }

  trackCliOptionProject(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagAll(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('all');
    }
  }

  trackCliOptionFormat(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'format',
        value: v,
      });
    }
  }
}
