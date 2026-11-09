// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions are literal workflow contracts, not JS interpolation.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = globalThis.test || require('node:test').test;
const read = file => readFileSync(join(__dirname, '../..', file), 'utf8');
const release = read('.github/workflows/release.yml');
const binaries = read('.github/workflows/candidate-binaries.yml');
const native = read('.github/workflows/native-binaries.yml');

function section(source, key, indent) {
  const lines = source.split('\n');
  const header = `${' '.repeat(indent)}${key}:`;
  const start = lines.indexOf(header);
  assert.notEqual(start, -1, `Missing ${header}`);
  let end = start + 1;
  while (
    end < lines.length &&
    (!lines[end].trim() ||
      lines[end].length - lines[end].trimStart().length > indent)
  )
    end++;
  return lines.slice(start + 1, end).join('\n');
}
const job = (source, name) => section(section(source, 'jobs', 0), name, 2);

const preparation = read('.github/workflows/version-packages.yml');

test('release selects H and copies the payloads its preparation run built', () => {
  const select = job(release, 'select');
  assert.match(select, /run: node utils\/verify-release\.mjs/);
  assert.match(select, /actions: read/);
  for (const output of ['preparation-run', 'payload-id']) {
    assert.match(
      select,
      new RegExp(
        `${output}: \\$\\{\\{ steps\\.select\\.outputs\\.${output} \\}\\}`
      )
    );
  }
  const fetch = job(release, 'fetch');
  assert.match(
    fetch,
    /artifact-ids: \$\{\{ needs\.select\.outputs\.payload-id \}\}/
  );
  assert.match(
    fetch,
    /run-id: \$\{\{ needs\.select\.outputs\.preparation-run \}\}/
  );
  assert.match(
    fetch,
    /name: release-payloads-attempt-\$\{\{ github\.run_attempt \}\}/
  );
  assert.doesNotMatch(fetch, /secrets\.|environment:|id-token:|: write\b/);
  for (const name of ['publish', 'finish']) {
    assert.match(
      job(release, name),
      /artifact-ids: \$\{\{ needs\.fetch\.outputs\.payload-id \}\}/
    );
  }
  // Release never rebuilds: no build, assemble or smoke jobs here.
  assert.doesNotMatch(
    section(release, 'jobs', 0),
    /candidate-(?:packages|binaries)\.yml|release-payloads\.mjs|native-binaries\.yml/
  );
});

test('preparation builds exact H with no remote cache and no OIDC token', () => {
  for (const name of ['build-packages', 'build-binaries']) {
    const body = job(preparation, name);
    assert.match(
      body,
      /ref: \$\{\{ needs\.version\.outputs\.candidateSha \}\}/
    );
    assert.doesNotMatch(body, /id-token/);
  }
  // PR jobs write the shared Turborepo cache; release builds must not read it.
  for (const workflow of [
    binaries,
    read('.github/workflows/candidate-packages.yml'),
  ]) {
    assert.match(workflow, /TURBO_CACHE: 'local:rw'/);
    assert.doesNotMatch(
      workflow,
      /remote-cache|setup-turborepo-remote-cache|TURBO_TEAM|id-token/
    );
  }
});

test('preparation signs macOS binaries immediately', () => {
  const caller = job(preparation, 'build-binaries');
  for (const secret of [
    'APPLE_API_KEY',
    'APPLE_CERT_DATA',
    'APPLE_CERT_PASSWORD',
  ])
    assert.match(
      caller,
      new RegExp(`${secret}: \\$\\{\\{ secrets\\.${secret} \\}\\}`)
    );
  assert.match(
    binaries,
    /environment: \$\{\{ matrix\.sign && 'code-signing' \|\| fromJSON\('null'\) \}\}/
  );
  assert.match(binaries, /if: matrix\.sign/);
  assert.match(binaries, /rcodesign notary-submit/);
});

test('preparation native Builder checks have no signing or registry credentials', () => {
  const caller = job(preparation, 'native-builder-check');
  assert.match(caller, /uses: \.\/\.github\/workflows\/native-binaries\.yml/);
  assert.match(
    caller,
    /payload-id: \$\{\{ needs\.assemble\.outputs\.payload-id \}\}/
  );
  assert.doesNotMatch(
    caller + native,
    /secrets[.:]|environment:|id-token:|: write\b/
  );
  // Binaries are smoke-tested where they are built, not again after assembly.
  assert.match(binaries, /smoke-test-binary\.mjs/);
  assert.doesNotMatch(native, /smoke-test-binary\.mjs/);
  assert.match(native, /test-native-builders\.mjs/);
});

test('publishing keeps release.yml and environment release', () => {
  const publish = job(release, 'publish');
  assert.match(publish, /environment: release/);
  assert.match(publish, /id-token: write/);
  assert.match(publish, /node python\/publish\.mjs --artifacts/);
  assert.match(publish, /bash utils\/npm-publish\.sh/);
  assert.doesNotMatch(
    release,
    /changesets\/action|createCommitStatus|\/statuses\b/
  );
});

test('vercel waits on canary until manual promotion', () => {
  assert.match(read('utils/npm-publish.sh'), /tag=canary/);
  assert.match(
    section(release, 'on', 0),
    /workflow_dispatch:\n {4}inputs:\n {6}release-run:/
  );
  const promote = job(release, 'promote');
  assert.match(
    promote,
    /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/
  );
  assert.match(promote, /environment: release/);
  assert.match(promote, /id-token: write/);
  assert.match(
    promote,
    /\.github\/workflows\/release\.yml\\tpush\\tmain\\tsuccess/
  );
  assert.match(
    promote,
    /run: node utils\/promote-release\.mjs "\$RUNNER_TEMP\/release"/
  );
  assert.match(promote, /node utils\/publish-cli-release-notes\.mjs/);
  assert.doesNotMatch(job(release, 'finish'), /publish-cli-release-notes/);
  assert.match(job(release, 'select'), /if: github\.event_name == 'push'/);
});
