export type CiConclusionResult = 'succeeded' | 'failed' | 'skipped';

export type CiInvocation = {
  invocationId: string;
  attempt: number;
  teamId: string;
  createdAt: number;
  repositoryKey: string;
  ref: string;
  commitSha: string;
  status: string;
  /** Only standalone Vercel CI invocations support rerunning. */
  source?: { type: string };
  skipped?: { reason: string };
  completed?: { completedAt: number; conclusion?: CiConclusionResult };
  runConclusion?: { result: CiConclusionResult };
  setupConclusion?: { result: CiConclusionResult };
};

export type CiRepositoryInfo = {
  owner: string;
  name: string;
};

export type CiListInvocationsResponse = {
  invocations: CiInvocation[];
  repositories: Record<string, CiRepositoryInfo>;
  pagination: { nextCursor?: string };
};

export type CiTaskConclusion =
  | { result: 'succeeded' }
  | { result: 'cached' }
  | { result: 'failed'; reason: string }
  | { result: 'skipped'; reason: string };

export type CiJobConclusion =
  | { result: 'succeeded' }
  | { result: 'failed'; reason: string }
  | { result: 'skipped'; reason: string };

export type CiJobDefinition = {
  jobDefinitionId: string;
  kind: 'command' | 'turbo';
  name: string;
  command: string;
  createdAt: number;
};

export type CiJobRun = {
  jobDefinitionId: string;
  attempt: number;
  createdAt: number;
  started?: { startedAt: number };
  completed?: { completedAt: number; conclusion: CiJobConclusion };
};

export type CiTaskDefinition = {
  jobDefinitionId: string;
  jobRunAttempt: number;
  taskDefinitionId: string;
  name: string;
  dependencyTaskDefinitionIds: string[];
  createdAt: number;
};

export type CiTaskRun = {
  taskDefinitionId: string;
  attempt: number;
  createdAt: number;
  started?: { startedAt: number };
  completed?: { completedAt: number; conclusion: CiTaskConclusion };
};

export type CiInvocationTree = {
  invocation: CiInvocation;
  repositories: Record<string, CiRepositoryInfo>;
  jobs: Array<{
    definition: CiJobDefinition;
    run?: CiJobRun;
    tasks: Array<{ definition: CiTaskDefinition; run?: CiTaskRun }>;
  }>;
};

export type CiLogLine = {
  level: string;
  timestamp: number;
  message: string;
};
