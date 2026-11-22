import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import {
  org,
  run,
  runExpectingAgentExit,
  jsonOutput,
  setupOrganizationsTest,
} from './helpers';

setupOrganizationsTest();

describe('organizations update', () => {
  it('updates only the slug', async () => {
    client.scenario.patch(
      `/v1/organizations/${org.organizationId}`,
      (req, res) => {
        expect(req.query).toEqual({});
        expect(req.body).toEqual({ slug: 'acme-global' });
        res.json({ ...org, slug: 'acme-global' });
      }
    );
    expect(
      await run(
        'update',
        org.organizationId,
        '--slug',
        'acme-global',
        '--format',
        'json'
      )
    ).toBe(0);
    expect(jsonOutput()).toEqual({
      organization: { ...org, slug: 'acme-global' },
      outcome: 'updated',
    });
  });

  it('requires --slug', async () => {
    expect(
      await runExpectingAgentExit(
        'update',
        org.organizationId,
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'action_required',
      reason: 'missing_arguments',
    });
  });
});
