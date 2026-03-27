import { beforeEach, describe, expect, it } from 'vitest';
import { resolveExperimentalDepEnvVars } from '../../../../src/util/build/resolve-experimental-dep-env-vars';
import { client } from '../../../mocks/client';

describe('resolveExperimentalDepEnvVars()', () => {
  beforeEach(() => {
    client.reset();
  });

  it('prefers deployments matching both target and branch', async () => {
    client.scenario.get('/v6/deployments', (req, res) => {
      if (
        req.query.projectId === 'prj_payments' &&
        req.query.target === 'preview' &&
        req.query['meta-githubCommitRef'] === 'feature-branch'
      ) {
        return res.json({
          deployments: [
            {
              uid: 'dpl_payments_feature',
              url: 'payments-feature.vercel.app',
            },
          ],
        });
      }

      return res.json({ deployments: [] });
    });

    const result = await resolveExperimentalDepEnvVars({
      client,
      deps: {
        'payments.api': {
          projectId: 'prj_payments',
          env: 'PAYMENTS_API_URL',
        },
      },
      target: 'preview',
      branch: 'feature-branch',
    });

    expect(result).toEqual({
      envVars: {
        PAYMENTS_API_URL: 'https://payments-feature.vercel.app/api',
      },
      warnings: [],
    });
  });

  it('falls back to the latest deployment for the current target', async () => {
    client.scenario.get('/v6/deployments', (req, res) => {
      if (
        req.query.projectId === 'prj_payments' &&
        req.query.target === 'preview' &&
        !('meta-githubCommitRef' in req.query) &&
        !('meta-gitlabCommitRef' in req.query) &&
        !('meta-bitbucketCommitRef' in req.query)
      ) {
        return res.json({
          deployments: [
            {
              uid: 'dpl_payments_preview',
              url: 'payments-preview.vercel.app',
            },
          ],
        });
      }

      return res.json({ deployments: [] });
    });

    const result = await resolveExperimentalDepEnvVars({
      client,
      deps: {
        payments: {
          projectId: 'prj_payments',
          env: 'PAYMENTS_URL',
        },
      },
      target: 'preview',
      branch: 'feature-branch',
    });

    expect(result).toEqual({
      envVars: {
        PAYMENTS_URL: 'https://payments-preview.vercel.app',
      },
      warnings: [],
    });
  });

  it('falls back to any ready deployment when no target-specific deployment exists', async () => {
    client.scenario.get('/v6/deployments', (req, res) => {
      if (
        req.query.projectId === 'prj_payments' &&
        !('target' in req.query) &&
        !('meta-githubCommitRef' in req.query) &&
        !('meta-gitlabCommitRef' in req.query) &&
        !('meta-bitbucketCommitRef' in req.query)
      ) {
        return res.json({
          deployments: [
            {
              uid: 'dpl_payments_any',
              url: 'payments-any.vercel.app',
            },
          ],
        });
      }

      return res.json({ deployments: [] });
    });

    const result = await resolveExperimentalDepEnvVars({
      client,
      deps: {
        'payments.api': {
          projectId: 'prj_payments',
          env: 'PAYMENTS_API_URL',
        },
      },
      target: 'preview',
      branch: 'feature-branch',
    });

    expect(result).toEqual({
      envVars: {
        PAYMENTS_API_URL: 'https://payments-any.vercel.app/api',
      },
      warnings: [],
    });
  });
});
