import { describe, expect, it } from 'vitest';
import { buildSessionReport } from '../../../../src/commands/onboard/session-report';
import type { LedgerEvent } from '../../../../src/util/onboard-session';

const DEPLOY_URL = 'https://app-abc123-team.vercel.app';
const INSPECT_URL = 'https://vercel.com/team/app/dep123';

function deployment(overrides: Partial<LedgerEvent> = {}): LedgerEvent {
  return {
    type: 'deployment',
    url: DEPLOY_URL,
    target: 'preview',
    ...overrides,
  };
}

describe('session report', () => {
  it('reports a ledger deployment as deployed, costed as usage', () => {
    const report = buildSessionReport([deployment()], []);

    expect(report.rows).toEqual([
      expect.objectContaining({
        kind: 'deployment',
        resource: DEPLOY_URL,
        status: 'deployed',
        cost: 'usage',
      }),
    ]);
    expect(report.deployments).toEqual([DEPLOY_URL]);
  });

  it('folds a scraped URL sharing the dashboard URL into an alias row', () => {
    // The deploy output prints the deployment URL and its production alias;
    // the scraper sees both. Same inspect URL means same deployment, and a
    // second "deployment" that is really an alias overstates the session.
    const report = buildSessionReport(
      [deployment()],
      [
        { url: DEPLOY_URL, inspectUrl: INSPECT_URL, production: false },
        {
          url: 'https://app-pretty.vercel.app',
          inspectUrl: INSPECT_URL,
          production: false,
        },
      ]
    );

    expect(report.rows).toHaveLength(2);
    expect(report.rows[1]).toEqual(
      expect.objectContaining({
        kind: 'alias',
        resource: 'https://app-pretty.vercel.app',
        status: 'alias of the above',
      })
    );
    // The alias is not a deployment of its own.
    expect(report.deployments).toEqual([DEPLOY_URL]);
  });

  it('keeps a scraper-only URL with a different dashboard URL as unverified', () => {
    const report = buildSessionReport(
      [deployment()],
      [
        {
          url: 'https://other-xyz.vercel.app',
          inspectUrl: 'https://vercel.com/team/app/other',
          production: false,
        },
      ]
    );

    const unverified = report.rows.find(
      row => row.resource === 'https://other-xyz.vercel.app'
    );
    expect(unverified).toEqual(
      expect.objectContaining({ status: 'reported, unverified' })
    );
  });

  it('labels a production deployment as production, nothing more', () => {
    const report = buildSessionReport(
      [
        { type: 'project-created', project: 'app', org: 'team' },
        deployment({ target: 'production' }),
      ],
      []
    );

    const deployed = report.rows.find(row => row.kind === 'deployment');
    expect(deployed?.status).toBe('deployed, production');
  });

  it('relays the plan cost verbatim when the platform states one', () => {
    const report = buildSessionReport(
      [
        {
          type: 'resource-provisioned',
          integration: 'neon',
          resource: 'todo-db',
          plan: { name: 'Launch', cost: '$19', paymentMethodRequired: true },
        },
      ],
      []
    );

    expect(report.rows[0]).toEqual(
      expect.objectContaining({
        resource: 'todo-db (neon)',
        status: 'provisioned',
        cost: '$19 (Launch)',
      })
    );
  });

  it('shows the plan name and its own detail lines when no cost is stated — the exact Neon Launch payload', () => {
    // A real run reported "$0.35/mo" by parsing the storage rate out of the
    // detail lines; the data is now relayed as the platform wrote it.
    const report = buildSessionReport(
      [
        {
          type: 'resource-provisioned',
          integration: 'neon',
          resource: 'todo-fastapi-db',
          plan: {
            id: 'launch_v3',
            name: 'Launch',
            paymentMethodRequired: true,
            details: [
              { label: 'Storage', value: '$0.35 per GB-month' },
              { label: 'Maximum projects', value: '300' },
            ],
          },
        },
      ],
      []
    );

    expect(report.rows[0].cost).toBe('Launch plan');
    expect(report.rows[0].details).toEqual([
      'Storage: $0.35 per GB-month',
      'Maximum projects: 300',
    ]);
  });

  it('caps the relayed detail lines', () => {
    const report = buildSessionReport(
      [
        {
          type: 'resource-provisioned',
          integration: 'acme',
          resource: 'thing',
          plan: {
            name: 'Scale',
            paymentMethodRequired: true,
            details: Array.from({ length: 9 }, (_, i) => ({
              label: `Line ${i}`,
              value: String(i),
            })),
          },
        },
      ],
      []
    );

    expect(report.rows[0].details).toHaveLength(4);
  });

  it('marks a resource without plan data as an unknown plan', () => {
    const report = buildSessionReport(
      [{ type: 'resource-provisioned', integration: 'acme', resource: 'x' }],
      []
    );

    expect(report.rows[0].cost).toBe('unknown plan');
  });

  it('shows check counts measured by onboard verify, from the ledger', () => {
    const report = buildSessionReport(
      [
        deployment(),
        {
          type: 'verification',
          deployment: DEPLOY_URL,
          passed: 12,
          failed: 0,
        },
      ],
      []
    );

    expect(report.rows[0].status).toBe('deployed · 12/12 checks passed');
  });

  it('surfaces failing checks instead of implying success', () => {
    const report = buildSessionReport(
      [
        deployment(),
        { type: 'verification', deployment: DEPLOY_URL, passed: 9, failed: 3 },
      ],
      []
    );

    expect(report.rows[0].status).toBe('deployed · 3/12 checks failing');
  });

  it('uses the latest verification when checks were re-run', () => {
    const report = buildSessionReport(
      [
        deployment(),
        { type: 'verification', deployment: DEPLOY_URL, passed: 9, failed: 3 },
        {
          type: 'verification',
          deployment: DEPLOY_URL,
          passed: 12,
          failed: 0,
        },
      ],
      []
    );

    expect(report.rows[0].status).toBe('deployed · 12/12 checks passed');
  });

  it('reports projects and removals', () => {
    const report = buildSessionReport(
      [
        { type: 'project-created', project: 'app', org: 'team' },
        { type: 'resource-removed', resource: 'old-db' },
      ],
      []
    );

    expect(report.rows[0]).toEqual(
      expect.objectContaining({
        resource: 'project team/app',
        status: 'created',
        cost: '—',
      })
    );
    expect(report.rows[1]).toEqual(
      expect.objectContaining({
        resource: 'resource old-db',
        status: 'removed',
      })
    );
  });

  it('reports nothing for an empty session', () => {
    const report = buildSessionReport([], []);
    expect(report.rows).toEqual([]);
  });
});
