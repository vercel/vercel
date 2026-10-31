const { spawnSync } = require('child_process');
const { mkdtempSync, readFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

const workflow = readFileSync(
  join(__dirname, '..', '.github', 'workflows', 'test.yml'),
  'utf8'
);

// Reads the `CI_RETRY_SH: |` block scalar out of the workflow-level env.
function retryScript() {
  const lines = workflow.split('\n');
  const start = lines.indexOf('  CI_RETRY_SH: |');
  if (start === -1) {
    throw new Error('CI_RETRY_SH not found in test.yml');
  }
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line !== '' && !line.startsWith('    ')) {
      break;
    }
    body.push(line.slice(4));
  }
  return body.join('\n');
}

const script = retryScript();

function run(command) {
  const dir = mkdtempSync(join(tmpdir(), 'ci-retry-'));
  try {
    const result = spawnSync(
      'bash',
      ['-c', script, 'ci-retry', 'bash', '-c', command],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, CI_RETRY_DELAY_SECONDS: '0' },
      }
    );
    let attempts = 0;
    try {
      attempts = readFileSync(join(dir, 'attempts'), 'utf8').length;
    } catch {
      // The command never ran.
    }
    return { status: result.status, stdout: result.stdout, attempts };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Appends one character per attempt, then fails until attempt `succeedOn`.
function failUntil(succeedOn, exitCode = 7) {
  return `printf x >> attempts; [ "$(wc -c < attempts)" -ge ${succeedOn} ] || exit ${exitCode}`;
}

describe('CI_RETRY_SH', () => {
  it('runs a passing command once', () => {
    expect(run(failUntil(1))).toMatchObject({ status: 0, attempts: 1 });
  });

  it('retries a failing command until it passes', () => {
    const result = run(failUntil(3));
    expect(result).toMatchObject({ status: 0, attempts: 3 });
    expect(result.stdout).toContain('(attempt 1 of 3)');
    expect(result.stdout).toContain('(attempt 2 of 3)');
  });

  it('stops after 3 attempts with the last exit code', () => {
    expect(run(failUntil(4, 42))).toMatchObject({ status: 42, attempts: 3 });
  });
});

describe('Tests workflow', () => {
  it('runs every npm install through CI_RETRY_SH', () => {
    const bare = workflow
      .split('\n')
      .filter(line => /\bnpm i(nstall)? /.test(line))
      .filter(line => !line.includes('bash -c "$CI_RETRY_SH" ci-retry npm i'))
      .filter(line => !line.trimStart().startsWith('#'));
    expect(bare).toEqual([]);
  });

  // Jobs check out the PR head, which may predate any new utils/ script.
  it('does not run a retry script from the checked-out tree', () => {
    expect(workflow).not.toMatch(/bash utils\/ci-retry\.sh/);
  });
});
