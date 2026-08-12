import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { updateSubcommand } from '../../../../commands/dns/command';

const ALLOWED_RECORD_TYPES = [
  'A',
  'AAAA',
  'ALIAS',
  'CAA',
  'CNAME',
  'MX',
  'SRV',
  'TXT',
];

export class DnsUpdateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof updateSubcommand>
{
  trackCliArgumentId(recordId: string | undefined) {
    if (recordId) {
      this.trackCliArgument({
        arg: 'id',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionName(name: string | undefined) {
    if (name !== undefined) {
      this.trackCliOption({
        option: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionType(type: string | undefined) {
    if (type) {
      const allowedType = ALLOWED_RECORD_TYPES.includes(type)
        ? type
        : this.redactedValue;
      this.trackCliOption({
        option: 'type',
        value: allowedType,
      });
    }
  }

  trackCliOptionValue(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'value',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTtl(ttl: number | undefined) {
    if (ttl !== undefined) {
      this.trackCliOption({
        option: 'ttl',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionMxPriority(mxPriority: number | undefined) {
    if (mxPriority !== undefined) {
      this.trackCliOption({
        option: 'mx-priority',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSrvPriority(srvPriority: number | undefined) {
    if (srvPriority !== undefined) {
      this.trackCliOption({
        option: 'srv-priority',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSrvWeight(srvWeight: number | undefined) {
    if (srvWeight !== undefined) {
      this.trackCliOption({
        option: 'srv-weight',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSrvPort(srvPort: number | undefined) {
    if (srvPort !== undefined) {
      this.trackCliOption({
        option: 'srv-port',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSrvTarget(srvTarget: string | undefined) {
    if (srvTarget) {
      this.trackCliOption({
        option: 'srv-target',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionComment(comment: string | undefined) {
    if (comment !== undefined) {
      this.trackCliOption({
        option: 'comment',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
