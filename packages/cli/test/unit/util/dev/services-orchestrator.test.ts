import { describe, expect, it } from 'vitest';
import type {
  ExperimentalService,
  ExperimentalServiceV2,
} from '@vercel/build-utils';
import { ServicesOrchestrator } from '../../../../src/util/dev/services-orchestrator';

describe('ServicesOrchestrator', () => {
  it('injects queue configuration into a V2 Python service with sidecars', () => {
    const webService: ExperimentalServiceV2 = {
      schema: 'experimentalServicesV2',
      name: 'backend',
      root: 'backend',
      runtime: 'python',
      entrypoint: 'pyproject.toml',
      builder: {
        use: '@vercel/python',
        src: 'backend/pyproject.toml',
      },
    };
    const sidecar: ExperimentalService = {
      schema: 'experimentalServices',
      name: 'backend-worker',
      type: 'worker',
      trigger: 'queue',
      workspace: 'backend',
      runtime: 'python',
      builder: { use: '@vercel/python', src: 'worker.py' },
      topics: ['jobs'],
    };
    const orchestrator = new ServicesOrchestrator({
      services: [webService, sidecar],
      cwd: '/project',
      repoRoot: '/project',
      env: {},
      proxyOrigin: 'http://localhost:3000',
      useImplicitEnvInjection: false,
    });

    const { env } = (
      orchestrator as unknown as {
        getV2StartSpec(service: ExperimentalServiceV2): {
          env: NodeJS.ProcessEnv;
        };
      }
    ).getV2StartSpec(webService);

    expect(env).toMatchObject({
      VERCEL_HAS_WORKER_SERVICES: '1',
      VERCEL_QUEUE_BASE_URL: 'http://localhost:3000/_svc/_queues',
      VERCEL_QUEUE_TOKEN: 'vc-dev-token',
    });
  });
});
