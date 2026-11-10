import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { virtualModelsEditSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayVirtualModelsEditTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof virtualModelsEditSubcommand>
{
  trackCliArgumentSlug(slug: string | undefined) {
    if (slug) {
      this.trackCliArgument({ arg: 'slug', value: this.redactedValue });
    }
  }

  trackCliOptionModel(model: string | undefined) {
    if (model) {
      this.trackCliOption({ option: 'model', value: this.redactedValue });
    }
  }

  trackCliOptionDisplayName(displayName: string | undefined) {
    if (displayName) {
      this.trackCliOption({
        option: 'display-name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionDescription(description: string | undefined) {
    if (description) {
      this.trackCliOption({ option: 'description', value: this.redactedValue });
    }
  }

  trackCliOptionProviderOrder(providerOrder: string | undefined) {
    if (providerOrder) {
      this.trackCliOption({
        option: 'provider-order',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionProviderOnly(providerOnly: string | undefined) {
    if (providerOnly) {
      this.trackCliOption({
        option: 'provider-only',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionConfig(config: string | undefined) {
    if (config) {
      this.trackCliOption({ option: 'config', value: this.redactedValue });
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
