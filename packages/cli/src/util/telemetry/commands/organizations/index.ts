import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { organizationsCommand } from '../../../../commands/organizations/command';

export class OrganizationsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof organizationsCommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({ subcommand: 'list', value: actual });
  }
  trackCliSubcommandInspect(actual: string) {
    this.trackCliSubcommand({ subcommand: 'inspect', value: actual });
  }
  trackCliSubcommandCreate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'create', value: actual });
  }
  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({ subcommand: 'update', value: actual });
  }
  trackCliSubcommandTeams(actual: string) {
    this.trackCliSubcommand({ subcommand: 'teams', value: actual });
  }

  /** Records a nested `teams` operation as `teams:<action>`. */
  trackCliSubcommandTeamsAction(action: string, actual: string) {
    this.trackCliSubcommand({ subcommand: `teams:${action}`, value: actual });
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) this.trackCliFlag('json');
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) this.trackCliFlag('yes');
  }

  /**
   * The positional identifies a customer organization by ID or slug, so the
   * value is redacted.
   */
  trackCliArgumentOrganizationId(id: string | undefined) {
    if (id)
      this.trackCliArgument({
        arg: 'organization',
        value: this.redactedValue,
      });
  }

  trackCliOptionSlug(slug: string | undefined) {
    if (slug)
      this.trackCliOption({ option: 'slug', value: this.redactedValue });
  }

  trackCliOptionName(name: string | undefined) {
    if (name)
      this.trackCliOption({ option: 'name', value: this.redactedValue });
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit !== undefined)
      this.trackCliOption({ option: 'limit', value: String(limit) });
  }

  /** The selector holds a customer team ID or slug, so the value is redacted. */
  trackCliOptionChildTeam(team: string | undefined) {
    if (team)
      this.trackCliOption({ option: 'child-team', value: this.redactedValue });
  }

  trackCliOptionNext(cursor: string | undefined) {
    if (cursor)
      this.trackCliOption({ option: 'next', value: this.redactedValue });
  }

  /** The plan is a closed set, so a known value is recorded verbatim. */
  trackCliOptionBillingPlan(plan: string | undefined) {
    if (plan)
      this.trackCliOption({
        option: 'billing-plan',
        value:
          plan === 'platform' || plan === 'enterprise'
            ? plan
            : this.redactedValue,
      });
  }
}
