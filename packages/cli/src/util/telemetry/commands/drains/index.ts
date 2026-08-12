import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { drainsCommand } from '../../../../commands/drains/command';

const TRACKED_TYPES = [
  'log',
  'trace',
  'analytics',
  'speed_insights',
  'ai_gateway',
  'audit_log',
  'connect',
];
const TRACKED_ENCODINGS = ['json', 'ndjson'];
const TRACKED_COMPRESSIONS = ['gzip', 'none'];
const TRACKED_ENVIRONMENTS = ['production', 'preview'];

export class DrainsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof drainsCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'update',
      value: actual,
    });
  }

  trackCliSubcommandTest(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'test',
      value: actual,
    });
  }

  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'inspect',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }

  trackCliSubcommandPause(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'pause',
      value: actual,
    });
  }

  trackCliSubcommandResume(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'resume',
      value: actual,
    });
  }

  trackCliArgumentId(id: string | undefined) {
    if (id) {
      this.trackCliArgument({
        arg: 'id',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliOptionName(name: string | undefined) {
    if (name) {
      this.trackCliOption({
        option: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionType(type: string | undefined) {
    if (type) {
      this.trackCliOption({
        option: 'type',
        value: TRACKED_TYPES.includes(type) ? type : this.redactedValue,
      });
    }
  }

  trackCliOptionEndpoint(endpoint: string | undefined) {
    if (endpoint) {
      this.trackCliOption({
        option: 'endpoint',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEncoding(encoding: string | undefined) {
    if (encoding) {
      this.trackCliOption({
        option: 'encoding',
        value: TRACKED_ENCODINGS.includes(encoding)
          ? encoding
          : this.redactedValue,
      });
    }
  }

  trackCliOptionCompression(compression: string | undefined) {
    if (compression) {
      this.trackCliOption({
        option: 'compression',
        value: TRACKED_COMPRESSIONS.includes(compression)
          ? compression
          : this.redactedValue,
      });
    }
  }

  trackCliOptionHeader(headers: string[] | undefined) {
    if (headers && headers.length > 0) {
      this.trackCliOption({
        option: 'header',
        value: this.redactedArgumentsLength(headers),
      });
    }
  }

  trackCliOptionSecret(secret: string | undefined) {
    if (secret) {
      this.trackCliOption({
        option: 'secret',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSampling(sampling: number | undefined) {
    if (sampling !== undefined) {
      this.trackCliOption({
        option: 'sampling',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEnvironment(environment: string | undefined) {
    if (environment) {
      this.trackCliOption({
        option: 'environment',
        value: TRACKED_ENVIRONMENTS.includes(environment)
          ? environment
          : this.redactedValue,
      });
    }
  }
}
