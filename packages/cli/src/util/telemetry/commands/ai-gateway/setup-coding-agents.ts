import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { setupCodingAgentsSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewaySetupCodingAgentsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof setupCodingAgentsSubcommand>
{
  trackCliOptionAgent(agents: [string] | undefined) {
    if (agents && agents.length) {
      // Agent ids are a known enum; safe to record.
      for (const agent of agents) {
        this.trackCliOption({ option: 'agent', value: agent });
      }
    }
  }

  trackCliFlagAll(all: boolean | undefined) {
    if (all) {
      this.trackCliFlag('all');
    }
  }

  trackCliOptionKey(key: string | undefined) {
    if (key) {
      // Never record the secret itself.
      this.trackCliOption({ option: 'key', value: this.redactedValue });
    }
  }

  trackCliOptionBudget(budget: number | undefined) {
    if (budget !== undefined) {
      this.trackCliOption({ option: 'budget', value: this.redactedValue });
    }
  }

  trackCliOptionRefreshPeriod(refreshPeriod: string | undefined) {
    if (refreshPeriod) {
      this.trackCliOption({
        option: 'refresh-period',
        value: refreshPeriod,
      });
    }
  }

  trackCliFlagIncludeByok(includeByok: boolean | undefined) {
    if (includeByok) {
      this.trackCliFlag('include-byok');
    }
  }

  trackCliOptionExpiration(expiration: string | undefined) {
    if (expiration) {
      // Expiry values are a known enum (presets or `none`); safe to record.
      this.trackCliOption({ option: 'expiration', value: expiration });
    }
  }

  trackCliOptionName(name: string | undefined) {
    if (name) {
      this.trackCliOption({ option: 'name', value: this.redactedValue });
    }
  }

  trackCliFlagDryRun(dryRun: boolean | undefined) {
    if (dryRun) {
      this.trackCliFlag('dry-run');
    }
  }

  trackCliFlagNoBackup(noBackup: boolean | undefined) {
    if (noBackup) {
      this.trackCliFlag('no-backup');
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
