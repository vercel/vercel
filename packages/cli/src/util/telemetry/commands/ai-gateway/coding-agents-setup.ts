import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { setupSubcommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayCodingAgentsSetupTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof setupSubcommand>
{
  trackCliOptionAgent(agents: [string] | undefined) {
    if (agents && agents.length) {
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
      this.trackCliOption({ option: 'expiration', value: expiration });
    }
  }

  trackCliOptionName(name: string | undefined) {
    if (name) {
      this.trackCliOption({ option: 'name', value: this.redactedValue });
    }
  }

  trackCliFlagReconfigure(reconfigure: boolean | undefined) {
    if (reconfigure) {
      this.trackCliFlag('reconfigure');
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

  trackCliFlagNoKeychain(noKeychain: boolean | undefined) {
    if (noKeychain) {
      this.trackCliFlag('no-keychain');
    }
  }

  trackCliOptionAgentConfig(agentConfig: string[] | undefined) {
    if (agentConfig && agentConfig.length) {
      // Local paths may be sensitive; record only that the option was used.
      this.trackCliOption({
        option: 'agent-config',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionShellRc(shellRc: string | undefined) {
    if (shellRc) {
      this.trackCliOption({ option: 'shell-rc', value: this.redactedValue });
    }
  }

  trackCliOptionApply(apply: string | undefined) {
    if (apply) {
      this.trackCliOption({ option: 'apply', value: apply });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
