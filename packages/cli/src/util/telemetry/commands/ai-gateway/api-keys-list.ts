import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { listSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayApiKeysListTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listSubcommand>
{
  trackCliOptionQuery(query: string | undefined) {
    if (query) {
      this.trackCliOption({ option: 'query', value: this.redactedValue });
    }
  }

  trackCliOptionSearch(search: string | undefined) {
    if (search) {
      this.trackCliOption({ option: 'search', value: this.redactedValue });
    }
  }

  trackCliOptionCreator(creator: string | undefined) {
    if (creator) {
      this.trackCliOption({
        option: 'creator',
        value: creator === 'me' ? 'me' : this.redactedValue,
      });
    }
  }

  trackCliOptionState(state: string | undefined) {
    if (state) {
      this.trackCliOption({ option: 'state', value: state });
    }
  }

  trackCliOptionSort(sort: string | undefined) {
    if (sort) {
      this.trackCliOption({ option: 'sort', value: sort });
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
