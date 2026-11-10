import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { addSubcommand } from '../../../../commands/integration/command';
import {
  isSchemaKey,
  type MetadataParseError,
} from '../../../integration/parse-metadata';
import type { MetadataSchema } from '../../../integration/types';

export class IntegrationAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
{
  trackCliArgumentIntegration(v: string | undefined, known?: boolean) {
    if (v) {
      this.trackCliArgument({
        arg: 'integration',
        value: known ? v : this.redactedValue,
      });
    }
  }

  trackCliOptionName(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionMeta(v: string[] | undefined) {
    if (v?.length) {
      this.trackCliOption({
        option: 'meta',
        value: this.redactedValue,
      });
    }
  }

  // The deprecated names keep their own keys, to measure who still uses them.
  trackCliOptionMetadata(v: string[] | undefined) {
    if (v?.length) {
      this.trackCliOption({
        option: 'metadata',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionBillingPlan(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'billing-plan',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionPlan(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'plan',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagNoConnect(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('no-connect');
    }
  }

  trackCliFlagNoEnvPull(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('no-env-pull');
    }
  }

  trackCliOptionEnvironment(v: string[] | undefined) {
    if (v?.length) {
      this.trackCliOption({
        option: 'environment',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionInstallation(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'installation',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionInstallationId(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'installation-id',
        value: this.redactedValue,
      });
    }
  }

  trackMarketplaceEvent(event: string, props: Record<string, unknown>) {
    this.trackCommandOutput({
      key: event,
      value: JSON.stringify(props),
    });
  }

  /**
   * Records a `--meta` parse failure as `marketplace_install_flow_dropped`,
   * with why it failed and which key. The key is sent only when the schema
   * defines it, so a mistyped key is never sent, and values never are.
   */
  trackMetadataParseError(
    props: Record<string, unknown>,
    error: Pick<MetadataParseError, 'kind' | 'key'>,
    schema: MetadataSchema
  ) {
    this.trackMarketplaceEvent('marketplace_install_flow_dropped', {
      ...props,
      reason: 'metadata_parse_error',
      metadata_error: error.kind,
      metadata_key: isSchemaKey(schema, error.key) ? error.key : null,
    });
  }

  trackCliOptionPrefix(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'prefix',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagClaim(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('claim');
    }
  }

  trackCliFlagNoClaim(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('no-claim');
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
