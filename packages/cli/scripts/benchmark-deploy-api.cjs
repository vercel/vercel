const { blocked } = require('./benchmark-no-network.cjs');
const metadata = {
  '/teams/team_benchmark': { id: 'team_benchmark', slug: 'benchmark' },
  '/v9/projects/benchmark-project': {
    id: 'benchmark-project',
    name: 'benchmark-project',
    accountId: 'team_benchmark',
    framework: null,
    rootDirectory: null,
  },
};
let requests = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url
  );
  const method = init?.method || 'GET';
  if (
    process.env.BENCHMARK_DEPLOY_DRY_RUN !== '1' &&
    url.origin === 'https://api.vercel.com' &&
    method === 'POST' &&
    url.pathname === '/v13/deployments'
  ) {
    // Pipes can accept only part of a synchronous write. Wait for the complete
    // result to flush, and keep fetch pending so deployment cannot continue.
    return new Promise(() => {
      process.stdout.write(
        JSON.stringify({
          boundary: 'before-deployment-request',
          body: JSON.parse(init.body),
        }),
        () => process.exit(0)
      );
    });
  }
  if (
    url.origin !== 'https://api.vercel.com' ||
    method !== 'GET' ||
    !Object.hasOwn(metadata, url.pathname)
  ) {
    process.stderr.write(`Unexpected request: ${method} ${url.pathname}\n`);
    return blocked();
  }
  requests++;
  return new Response(JSON.stringify(metadata[url.pathname]), {
    headers: { 'content-type': 'application/json' },
  });
};
process.on('exit', () =>
  process.stderr.write(`BENCHMARK_METADATA_READS=${requests}\n`)
);
