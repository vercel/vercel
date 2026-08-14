import { describe, it, expect } from 'vitest';
import { client } from '../../../mocks/client';
import buy from '../../../../src/commands/buy';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

// `vercel buy v0` was advertised but always errored ("not yet available via the
// CLI"). It has been removed: `v0` is no longer a recognized `buy` subcommand,
// so it falls through to the buy help (exit 2) and nothing is purchased.
// Buying v0 *credits* (`vercel buy credits v0 …`) is unaffected and covered by
// credits.test.ts.
describe('buy v0 (removed)', () => {
  it('is no longer a subcommand: shows buy help and does not advertise v0', async () => {
    useUser();
    const team = useTeam();
    client.config.currentTeam = team.id;

    client.setArgv('buy', 'v0');
    const exitCode = await buy(client);

    // Falls through to the buy help instead of running a (broken) purchase.
    expect(exitCode).toBe(2);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Purchase Vercel products');
    // v0 is no longer advertised as a purchasable subscription.
    expect(stderr).not.toContain('Purchase a v0 subscription');
    expect(stderr).not.toContain('buy v0');
  });

  it('does not emit a v0 subcommand telemetry event', async () => {
    useUser();
    const team = useTeam();
    client.config.currentTeam = team.id;

    client.setArgv('buy', 'v0');
    await buy(client);

    const events = client.telemetryEventStore.readonlyEvents;
    expect(events.some(e => e.key === 'subcommand:v0')).toBe(false);
  });
});
