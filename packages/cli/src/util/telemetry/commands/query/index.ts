import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { queryCommand } from '../../../../commands/query/command';

export class QueryTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof queryCommand>
{
  trackCliOptionProject(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTeam(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'team',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEvent(v: string | undefined) {
    if (v) {
      // Event types are not sensitive, can track actual value
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

  trackCliOptionGroupBy(v: string[] | undefined) {
    if (v && v.length > 0) {
      // Track count of dimensions, not the actual values
      this.trackCliOption({
        option: 'group-by',
        value: v.length.toString(),
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

  trackCliOptionGranularity(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'granularity',
        value: this.redactedValue,
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

  trackCliFlagSummaryOnly(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('summary-only');
    }
  }

  trackCliOptionInput(v: string | undefined) {
    if (v) {
      // Track whether stdin or file, not the path
      const value = v === '-' ? 'stdin' : 'file';
      this.trackCliOption({
        option: 'input',
        value,
      });
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }

  trackCliFlagShowStatistics(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('show-statistics');
    }
  }
}
