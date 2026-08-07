import { describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import deploy from '../../../../src/commands/deploy';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import output from '../../../../src/output-manager';
import * as createDeployModule from '../../../../src/util/deploy/create-deploy';
import { BuildsRateLimited } from '../../../../src/util/errors-ts';
import { getErrorCta } from '../../../../src/util/get-error-cta';

// The upgrade call to action is chosen by the backend (which knows the plan,
// limits and billing URL) and shipped in the error meta. The CLI renders it
// rather than hardcoding plan logic.
describe('getErrorCta', () => {
  it('prefers the newer ctaLabel/ctaUrl pair', () => {
    expect(
      getErrorCta({
        ctaLabel: 'Upgrade to Pro',
        ctaUrl: 'https://x',
        action: 'Learn More',
        link: 'https://y',
      })
    ).toEqual({ label: 'Upgrade to Pro', url: 'https://x' });
  });

  it('falls back to the legacy action/link pair', () => {
    expect(getErrorCta({ action: 'Learn More', link: 'https://y' })).toEqual({
      label: 'Learn More',
      url: 'https://y',
    });
  });

  it('returns undefined unless a complete pair is present', () => {
    expect(getErrorCta({})).toBeUndefined();
    expect(getErrorCta({ ctaLabel: 'Upgrade' })).toBeUndefined();
    expect(getErrorCta({ link: 'https://y' })).toBeUndefined();
  });
});

describe('deploy — builds_rate_limited upgrade hint', () => {
  it('surfaces the error and the backend CTA on a builds_rate_limited 429', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({ ...defaultProject, name: 'static', id: 'static' });

    // The real production trigger: API returns builds_rate_limited with a
    // plan-appropriate call to action in the error meta.
    client.scenario.post('/v13/deployments', (_req, res) => {
      res.status(429).json({
        error: {
          code: 'builds_rate_limited',
          message: 'You have reached your daily builds limit.',
          ctaLabel: 'Upgrade to Pro',
          ctaUrl: 'https://vercel.com/dashboard?upgradeToPro=builds-limit',
        },
      });
    });

    const noteSpy = vi.spyOn(output, 'note');
    const errorSpy = vi.spyOn(output, 'error');

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy');
    const exitCode = await deploy(client);

    expect(exitCode).toBe(1);

    // The error reaches the user with the server message (and no `(429)` suffix).
    const errorMessages = errorSpy.mock.calls.map(c => String(c[0]));
    expect(
      errorMessages.some(m =>
        m.includes('You have reached your daily builds limit.')
      )
    ).toBe(true);
    expect(errorMessages.some(m => m.includes('(429)'))).toBe(false);

    // The backend's CTA (label + URL) is rendered.
    const noteMessages = noteSpy.mock.calls.map(c => String(c[0]));
    expect(
      noteMessages.some(
        m =>
          m.includes('Upgrade to Pro') &&
          m.includes('upgradeToPro=builds-limit')
      )
    ).toBe(true);
  });

  it('renders the legacy action/link CTA from the error meta', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({ ...defaultProject, name: 'static', id: 'static' });

    vi.spyOn(createDeployModule, 'default').mockRejectedValue(
      new BuildsRateLimited('You have reached your daily builds limit.', {
        action: 'Learn More',
        link: 'https://vercel.link/builds-limit',
      })
    );

    const noteSpy = vi.spyOn(output, 'note');

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy');
    const exitCode = await deploy(client);

    expect(exitCode).toBe(1);
    const noteMessages = noteSpy.mock.calls.map(c => String(c[0]));
    expect(
      noteMessages.some(
        m => m.includes('Learn More') && m.includes('vercel.link/builds-limit')
      )
    ).toBe(true);
  });

  it('falls back to a plan-agnostic nudge when the API sends no CTA', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({ ...defaultProject, name: 'static', id: 'static' });

    vi.spyOn(createDeployModule, 'default').mockRejectedValue(
      new BuildsRateLimited('You have reached your daily builds limit.')
    );

    const noteSpy = vi.spyOn(output, 'note');

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy');
    const exitCode = await deploy(client);

    expect(exitCode).toBe(1);
    const noteMessages = noteSpy.mock.calls.map(c => String(c[0]));
    expect(
      noteMessages.some(m =>
        /Upgrade your plan to increase your builds limit\./.test(m)
      )
    ).toBe(true);
  });
});
