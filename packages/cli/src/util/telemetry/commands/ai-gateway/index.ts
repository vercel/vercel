import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { aiGatewayCommand } from '../../../../commands/ai-gateway/command';

export class AiGatewayTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof aiGatewayCommand>
{
  trackCliSubcommandSetup(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'setup',
      value: actual,
    });
  }

  trackCliSubcommandApiKeys(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'api-keys',
      value: actual,
    });
  }

  trackCliSubcommandBudgets(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'budgets',
      value: actual,
    });
  }

  trackCliSubcommandRules(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'rules',
      value: actual,
    });
  }

  trackCliSubcommandCodingAgents(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'coding-agents',
      value: actual,
    });
  }

  trackCliSubcommandModels(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'models',
      value: actual,
    });
  }

  trackCliSubcommandLeaderboard(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'leaderboard',
      value: actual,
    });
  }
}
