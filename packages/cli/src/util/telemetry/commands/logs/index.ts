import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { logsCommand } from '../../../../commands/logs/command';

export class LogsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof logsCommand>
{
  trackCliArgumentUrlOrDeploymentId(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'urlOrDeploymentId',
        value: this.redactedValue,
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

  trackCliOptionDeployment(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'deployment',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEnvironment(v: string | undefined) {
    if (v) {
      const allowed = ['production', 'preview'].includes(v)
        ? v
        : this.redactedValue;
      this.trackCliOption({
        option: 'environment',
        value: allowed,
      });
    }
  }

  trackCliOptionLevel(v: string[] | undefined) {
    if (v && v.length > 0) {
      const allowedLevels = ['error', 'warning', 'info', 'fatal'];
      const sanitized = v.every(l => allowedLevels.includes(l))
        ? v.join(',')
        : this.redactedValue;
      this.trackCliOption({
        option: 'level',
        value: sanitized,
      });
    }
  }

  trackCliOptionStatusCode(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'status-code',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSource(v: string[] | undefined) {
    if (v && v.length > 0) {
      const allowedSources = [
        'serverless',
        'edge-function',
        'edge-middleware',
        'static',
      ];
      const sanitized = v.every(s => allowedSources.includes(s))
        ? v.join(',')
        : this.redactedValue;
      this.trackCliOption({
        option: 'source',
        value: sanitized,
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

  trackCliOptionLimit(v: number | undefined) {
    if (typeof v === 'number') {
      this.trackCliOption({
        option: 'limit',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }

  trackCliFlagFollow(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('follow');
    }
  }

  trackCliFlagNoFollow(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('no-follow');
    }
  }

  trackCliOptionQuery(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'query',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRequestId(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'request-id',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagExpand(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('expand');
    }
  }

  trackCliOptionBranch(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'branch',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagNoBranch(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('no-branch');
    }
  }
}
