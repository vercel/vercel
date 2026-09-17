// @ts-check
const { execFileSync } = require('node:child_process');
const { appendFileSync } = require('node:fs');
const { getChunkedTests } = require('./chunk-tests');

const UNIT_TASKS = [
  'test-unit',
  '//#test',
  'vercel_runtime#test',
  'vercel-runtime#test',
  'vercel-workers#test',
];
const E2E_TASKS = [
  'test-e2e-artifacts',
  'test-e2e-builder',
  'test-e2e-independent',
  'test-e2e-node-all-versions',
  'test-next-local',
  'test-next-local-windows',
  'test-dev-artifacts',
];
const TASKS = [...UNIT_TASKS, ...E2E_TASKS];

function selectTasks(plan, entrypoints) {
  if (!Array.isArray(plan.tasks)) {
    throw new Error('Turbo did not return a task plan');
  }
  return plan.tasks
    .filter(
      task =>
        (entrypoints.includes(task.task) ||
          entrypoints.includes(task.taskId)) &&
        task.command !== '<NONEXISTENT>'
    )
    .map(({ package: packageName, directory, task, command }) => {
      if (
        !packageName ||
        typeof directory !== 'string' ||
        typeof command !== 'string' ||
        !command
      ) {
        throw new Error(`Invalid executable task: ${packageName}#${task}`);
      }
      return { package: packageName, directory, task, command };
    });
}

function runTurbo(args) {
  return JSON.parse(
    execFileSync('turbo', args, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    })
  );
}

async function planTests({ base, head, changedFiles, run = runTurbo } = {}) {
  if (Boolean(base) !== Boolean(head)) {
    throw new Error('Provide both TURBO_SCM_BASE and TURBO_SCM_HEAD');
  }
  const all = run(['run', ...TASKS, '--dry=json']);
  const affected = base
    ? run(['run', ...TASKS, '--affected', '--dry=json'])
    : all;
  const allTasks = selectTasks(all, TASKS);
  if (allTasks.length === 0) {
    throw new Error('No executable tests found in the workspace');
  }
  const allE2E =
    Boolean(base) &&
    requiresAllE2E(
      changedFiles ??
        execFileSync('git', ['diff', '--name-only', base, head], {
          encoding: 'utf8',
        }).split('\n')
    );
  const unitTasks = selectTasks(affected, UNIT_TASKS);
  const e2eTasks = selectTasks(allE2E ? all : affected, E2E_TASKS);
  const unitTests = await getChunkedTests(unitTasks);
  const e2eTests = await getChunkedTests(e2eTasks);
  if (e2eTests.length > 256) {
    throw new Error(
      `E2E matrix exceeds GitHub's 256-job limit: ${e2eTests.length}`
    );
  }
  const packages = [
    ...new Set([...unitTasks, ...e2eTasks].map(task => task.package)),
  ].sort();
  const allPackages = [...new Set(allTasks.map(task => task.package))].sort();
  return {
    unitBatches: batchTests(unitTests),
    e2eTests,
    packages: packages.join(','),
    allPackages: allPackages.join(','),
    count: packages.length,
    total: allPackages.length,
    strategy: !base
      ? 'test-all'
      : allE2E
        ? 'all-e2e'
        : packages.length
          ? 'affected-only'
          : 'no-tests',
  };
}

function requiresAllE2E(files) {
  return files.some(
    file =>
      [
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'turbo.json',
        'Cargo.toml',
        'Cargo.lock',
        'pyproject.toml',
        'uv.lock',
        'packages/cli/scripts/start.js',
      ].includes(file) ||
      [
        '.github/workflows/',
        'utils/',
        'test/lib/',
        'packages/build-utils/src/',
      ].some(prefix => file.startsWith(prefix))
  );
}

function batchTests(tests) {
  const batches = [];
  for (let index = 0; index < tests.length; index += 256) {
    batches.push({ tests: tests.slice(index, index + 256) });
  }
  if (batches.length > 256) {
    throw new Error('Too many unit-test batches for a GitHub matrix');
  }
  return batches;
}

if (require.main === module) {
  planTests({
    base: process.env.TURBO_SCM_BASE,
    head: process.env.TURBO_SCM_HEAD,
  }).then(
    plan => {
      if (process.env.GITHUB_OUTPUT) {
        appendFileSync(
          process.env.GITHUB_OUTPUT,
          Object.entries(plan)
            .map(
              ([key, value]) =>
                `${key}=${Array.isArray(value) ? JSON.stringify(value) : value}\n`
            )
            .join('')
        );
      }
      console.log(JSON.stringify(plan));
    },
    error => {
      console.error(error);
      process.exitCode = 1;
    }
  );
}

module.exports = { planTests, selectTasks, batchTests };
