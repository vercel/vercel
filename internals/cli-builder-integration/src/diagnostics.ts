import { defineDiagnostics } from 'nostics';

export const buildDiagnostics = defineDiagnostics({
  codes: {
    BUILD_BUILDER_LOAD_FAILED: {
      why: (p: { use: string }) => `Failed to load Builder "${p.use}"`,
      fix: 'Check that the builder is installed and spelled correctly in your Vercel configuration.',
    },
    BUILD_CONCURRENT_INPROCESS: {
      why: (p: { entrypoint: string }) =>
        `Internal error: build for "${p.entrypoint}" was scheduled concurrently but cannot run in a subprocess`,
      fix: 'This is a Vercel CLI error. Report it at https://vercel.com/help.',
    },
    BUILD_WORKER_MULTIPLE_TOPICS: {
      why: (p: { name: string; topics: number }) =>
        `Worker service "${p.name}" has ${p.topics} topics, but multiple topics are only supported for Python workers.`,
      fix: 'Configure one topic per worker service, or use a Python worker for multiple topics.',
    },
  },
});
