const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { getChunkedTests } = require('./chunk-tests');

const TEST_TASKS = [
  'test-unit',
  'test',
  'test-e2e',
  'test-e2e-artifacts',
  'test-e2e-builder',
  'test-e2e-independent',
  'test-e2e-node-all-versions',
  'test-next-local',
  'test-next-local-windows',
  'test-dev',
  'test-dev-artifacts',
];

function executableTests(summary) {
  if (!Array.isArray(summary.tasks)) {
    throw new Error('Turbo dry run did not return tasks');
  }
  return summary.tasks.filter(
    task =>
      TEST_TASKS.includes(task.task) &&
      task.command &&
      task.command !== '<NONEXISTENT>'
  );
}

function selectTestTasks(summary, allTasks) {
  // Prefer the dedicated unit lane even when it is unaffected. Packages
  // without one still need their generic test task to cover unit tests.
  const unitPackages = new Set(
    allTasks.filter(task => task.task === 'test-unit').map(task => task.package)
  );
  return executableTests(summary).filter(
    task => task.task !== 'test' || !unitPackages.has(task.package)
  );
}

function needsFullSuite(changedFiles) {
  return changedFiles.some(file =>
    /^(?:\.github\/workflows\/|turbo\.json$|package\.json$|pnpm-(?:lock\.yaml|workspace\.yaml)$|utils\/|test\/lib\/|packages\/cli\/scripts\/start\.js$|packages\/build-utils\/src\/)/.test(
      file
    )
  );
}

async function createTestPlan(allSummary, affectedSummary = allSummary) {
  const allTasks = executableTests(allSummary);
  const allTests = selectTestTasks(allSummary, allTasks);
  if (allTests.length === 0) {
    throw new Error('Turbo did not report any executable test tasks');
  }
  const selectedTests = selectTestTasks(affectedSummary, allTasks);
  const chunks = await getChunkedTests(selectedTests);
  const allChunks =
    allSummary === affectedSummary ? chunks : await getChunkedTests(allTests);
  if (allChunks.length === 0) {
    throw new Error('Turbo did not report any executable test tasks');
  }
  // A generic fallback can also include integration tests. Schedule it with
  // deployment artifacts whenever that package has a dedicated E2E lane.
  const e2ePackages = new Set(
    allTasks
      .filter(task => task.task !== 'test' && task.task !== 'test-unit')
      .map(task => task.package)
  );
  const unitTests = chunks.filter(
    chunk =>
      chunk.scriptName === 'test-unit' ||
      (chunk.scriptName === 'test' && !e2ePackages.has(chunk.packageName))
  );
  const matrices = {
    unitTests: unitTests.slice(0, 256),
    unitTestsExtra: unitTests.slice(256),
    e2eTests: chunks.filter(chunk => !unitTests.includes(chunk)),
  };
  for (const [name, cells] of Object.entries(matrices)) {
    if (cells.length > 256) {
      throw new Error(`${name} exceeds GitHub's 256-job matrix limit`);
    }
  }
  const packages = [...new Set(chunks.map(chunk => chunk.packageName))].sort();
  const allPackages = [
    ...new Set(allChunks.map(chunk => chunk.packageName)),
  ].sort();
  return {
    ...matrices,
    packages: packages.join(','),
    allPackages: allPackages.join(','),
    count: packages.length,
    total: allPackages.length,
  };
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const baseSha = process.argv[2];
  const localTurbo = path.join(root, 'node_modules', '.bin', 'turbo');
  const turbo = fs.existsSync(localTurbo) ? localTurbo : 'turbo';
  const runTurbo = affected =>
    JSON.parse(
      execFileSync(
        turbo,
        [
          'run',
          ...TEST_TASKS,
          '--dry=json',
          ...(affected ? ['--affected'] : []),
        ],
        {
          cwd: root,
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          env: {
            ...process.env,
            TURBO_SCM_BASE: baseSha || '',
            TURBO_SCM_HEAD: 'HEAD',
          },
          stdio: ['ignore', 'pipe', 'inherit'],
        }
      )
    );
  const allSummary = runTurbo(false);
  const changedFiles = baseSha
    ? execFileSync('git', ['diff', '--name-only', '-z', `${baseSha}...HEAD`], {
        cwd: root,
        encoding: 'utf8',
      }).split('\0')
    : [];
  const fullSuite = !baseSha || needsFullSuite(changedFiles);
  const plan = await createTestPlan(
    allSummary,
    fullSuite ? allSummary : runTurbo(true)
  );
  plan.strategy = fullSuite
    ? baseSha
      ? 'all-e2e'
      : 'test-all'
    : plan.count > 0
      ? 'affected-only'
      : 'no-tests';
  if (process.env.GITHUB_OUTPUT) {
    for (const [key, value] of Object.entries(plan)) {
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `${key}=${Array.isArray(value) ? JSON.stringify(value) : value}\n`
      );
    }
  }
  console.log(JSON.stringify(plan));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { createTestPlan, needsFullSuite, selectTestTasks };
