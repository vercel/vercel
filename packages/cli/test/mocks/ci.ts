import { execFileSync } from 'node:child_process';
import { setupTmpDir } from '../helpers/setup-unit-fixture';
import type {
  CiInvocation,
  CiInvocationTree,
  CiTaskConclusion,
} from '../../src/util/ci/types';

export function createCiGitRepo(
  options: { remote?: string; branch?: string } = {}
): { cwd: string; sha: string } {
  const cwd = setupTmpDir();
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  git('init', '-q', '-b', options.branch ?? 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  git('commit', '-q', '--allow-empty', '-m', 'initial');
  if (options.remote !== '') {
    git(
      'remote',
      'add',
      'origin',
      options.remote ?? 'https://github.com/vercel/next.js.git'
    );
  }

  return { cwd, sha: git('rev-parse', 'HEAD') };
}

export function createCiInvocation(
  overrides: Partial<CiInvocation> = {}
): CiInvocation {
  return {
    invocationId: 'invo1_abc123',
    attempt: 1,
    teamId: 'team_dummy',
    createdAt: Date.now() - 4 * 60 * 1000,
    repositoryKey: 'ownr1_test:repo1_test',
    ref: 'refs/heads/main',
    commitSha: 'a'.repeat(40),
    status: 'completed',
    completed: { completedAt: Date.now(), conclusion: 'succeeded' },
    runConclusion: { result: 'succeeded' },
    ...overrides,
  };
}

export function createCiTree(
  overrides: {
    invocation?: Partial<CiInvocation>;
    taskConclusion?: CiTaskConclusion;
    running?: boolean;
  } = {}
): CiInvocationTree {
  const startedAt = Date.now() - 90_000;
  const running = overrides.running ?? false;
  return {
    invocation: createCiInvocation(
      running
        ? {
            status: 'awaiting_jobs',
            completed: undefined,
            runConclusion: undefined,
            ...overrides.invocation,
          }
        : overrides.invocation
    ),
    repositories: {
      'ownr1_test:repo1_test': { owner: 'vercel', name: 'next.js' },
    },
    jobs: [
      {
        definition: {
          jobDefinitionId: 'jobd1_turbo',
          kind: 'turbo',
          name: 'turbo run build test',
          command: 'turbo run build test',
          createdAt: startedAt,
        },
        run: {
          jobDefinitionId: 'jobd1_turbo',
          attempt: 1,
          createdAt: startedAt,
          started: { startedAt },
        },
        tasks: [
          {
            definition: {
              jobDefinitionId: 'jobd1_turbo',
              jobRunAttempt: 1,
              taskDefinitionId: 'tskd1_webtest',
              name: 'web#test',
              dependencyTaskDefinitionIds: [],
              createdAt: startedAt,
            },
            run: {
              taskDefinitionId: 'tskd1_webtest',
              attempt: 1,
              createdAt: startedAt,
              started: { startedAt },
              ...(running
                ? {}
                : {
                    completed: {
                      completedAt: startedAt + 62_000,
                      conclusion: overrides.taskConclusion ?? {
                        result: 'succeeded',
                      },
                    },
                  }),
            },
          },
        ],
      },
    ],
  };
}
