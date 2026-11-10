const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  stat,
  rm,
} = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { basename, join } = require('node:path');
const test = globalThis.test || require('node:test').test;
const load = import('./archive-candidate-binary.mjs');
const sha = 'a'.repeat(40);
const tar =
  process.platform === 'win32'
    ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
const python = process.platform === 'win32' ? 'python' : 'python3';

const platforms = [
  ['macos-arm64', 'vercel-darwin-arm64', null],
  ['macos-x64', 'vercel-darwin-x64', null],
  ['linux-arm64', 'vercel-linux-arm64', 'glibc'],
  ['linux-x64', 'vercel-linux-x64', 'glibc'],
  ['linux-arm64', 'vercel-linux-arm64-musl', 'musl'],
  ['linux-x64', 'vercel-linux-x64-musl', 'musl'],
  ['win-arm64', 'vercel-windows-arm64.exe', null],
  ['win-x64', 'vercel-windows-x64.exe', null],
];
const cliVersion = JSON.parse(
  readFileSync(join(__dirname, '..', 'packages/cli/package.json'), 'utf8')
).version;

async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'candidate binary '));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

for (const [platform, file, libc] of platforms) {
  test(`archives ${file} bytes with checksum, libc, source and run metadata`, async () => {
    await fixture(async dir => {
      const { archiveCandidateBinary } = await load;
      const bytes = Buffer.from([0, 1, 2, 3, 255, 128]);
      const binaryPath = join(dir, file);
      await writeFile(binaryPath, bytes, { mode: 0o644 });
      const outputDirectory = join(dir, 'artifacts');
      const archive = await archiveCandidateBinary({
        binaryPath,
        target: `node24.14.1-${platform}`,
        libc,
        sha,
        version: '1.2.3',
        outputDirectory,
        runId: '123',
        runAttempt: '2',
      });
      assert.equal(archive, join(outputDirectory, `${file}.tar.gz`));
      assert.deepEqual(
        execFileSync(tar, ['-tzf', basename(archive)], {
          cwd: outputDirectory,
          encoding: 'utf8',
        })
          .trim()
          .split(/\r?\n/)
          .sort(),
        [file, `${file}.sha256`, `${file}.manifest.json`].sort()
      );
      const extracted = join(outputDirectory, 'extracted');
      await mkdir(extracted);
      execFileSync(tar, ['-xzf', basename(archive), '-C', 'extracted'], {
        cwd: outputDirectory,
      });
      assert.deepEqual(await readFile(join(extracted, file)), bytes);
      const digest = createHash('sha256').update(bytes).digest('hex');
      assert.equal(
        await readFile(join(extracted, `${file}.sha256`), 'utf8'),
        `${digest}  ${file}\n`
      );
      assert.deepEqual(
        JSON.parse(
          await readFile(join(extracted, `${file}.manifest.json`), 'utf8')
        ),
        {
          schemaVersion: 1,
          sourceSha: sha,
          cliVersion: '1.2.3',
          target: `node24.14.1-${platform}`,
          libc,
          binary: file,
          sha256: digest,
          size: bytes.length,
          releaseSigned: false,
          workflowRunId: '123',
          workflowRunAttempt: '2',
        }
      );
      // Windows does not expose POSIX execution bits; validate them on Unix hosts.
      if (process.platform !== 'win32')
        assert.equal((await stat(join(extracted, file))).mode & 0o777, 0o755);
    });
  });
}

test('Python reads exactly three regular archive members without AppleDouble metadata', async () => {
  await fixture(async dir => {
    const { archiveCandidateBinary } = await load;
    const file = 'vercel-darwin-x64';
    const binaryPath = join(dir, file);
    const bytes = Buffer.from([0, 1, 2, 3, 255, 128]);
    await writeFile(binaryPath, bytes);
    // Force bsdtar's AppleDouble path on macOS instead of depending on ambient
    // filesystem metadata. Other hosts still exercise the same Python reader.
    if (process.platform === 'darwin') {
      execFileSync('xattr', [
        '-w',
        'com.vercel.candidate-binary-test',
        'metadata must not enter the archive',
        binaryPath,
      ]);
    }
    const archive = await archiveCandidateBinary({
      binaryPath,
      target: 'node24.14.1-macos-x64',
      sha,
      version: cliVersion,
      outputDirectory: join(dir, 'artifacts'),
      runId: '123',
      runAttempt: '2',
    });
    // macOS tar -t can hide ._ members. Python's stdlib exposes them, just like
    // the strict release verifier; inspect the producer's real archive bytes.
    const contents = JSON.parse(
      execFileSync(
        python,
        [
          '-c',
          `
import json, sys, tarfile
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    binary = sys.argv[2]
    print(json.dumps({
        'entries': [{'name': member.name, 'regular': member.isfile()}
                    for member in archive.getmembers()],
        'binary': archive.extractfile(binary).read().hex(),
        'checksum': archive.extractfile(binary + '.sha256').read().decode('utf-8'),
        'manifest': json.load(archive.extractfile(binary + '.manifest.json')),
    }))
`,
          archive,
          file,
        ],
        { encoding: 'utf8' }
      )
    );
    assert.deepEqual(
      contents.entries,
      [file, `${file}.sha256`, `${file}.manifest.json`].map(name => ({
        name,
        regular: true,
      }))
    );
    assert.equal(contents.binary, bytes.toString('hex'));
    const digest = createHash('sha256').update(bytes).digest('hex');
    assert.equal(contents.checksum, `${digest}  ${file}\n`);
    assert.deepEqual(contents.manifest, {
      schemaVersion: 1,
      sourceSha: sha,
      cliVersion,
      target: 'node24.14.1-macos-x64',
      libc: null,
      binary: file,
      sha256: digest,
      size: bytes.length,
      releaseSigned: false,
      workflowRunId: '123',
      workflowRunAttempt: '2',
    });
  });
});

for (const [platform, file, libc] of platforms) {
  test(`CLI archives ${file} with the checked-out CLI version and exact target`, async () => {
    await fixture(async dir => {
      const binaryPath = join(dir, file);
      await writeFile(binaryPath, 'candidate bytes');
      const outputDirectory = join(dir, 'artifacts');
      const target = `node24.14.1-${platform}`;
      const archive = execFileSync(
        process.execPath,
        [
          join(__dirname, 'archive-candidate-binary.mjs'),
          binaryPath,
          target,
          sha,
          outputDirectory,
          libc || '',
        ],
        {
          cwd: dir,
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_RUN_ID: '456',
            GITHUB_RUN_ATTEMPT: '3',
          },
        }
      ).trim();
      assert.equal(archive, join(outputDirectory, `${file}.tar.gz`));
      const manifest = JSON.parse(
        execFileSync(
          tar,
          ['-xOf', basename(archive), `${file}.manifest.json`],
          {
            cwd: outputDirectory,
            encoding: 'utf8',
          }
        )
      );
      assert.equal(manifest.schemaVersion, 1);
      assert.equal(manifest.sourceSha, sha);
      assert.equal(manifest.cliVersion, cliVersion);
      assert.equal(manifest.target, target);
      assert.equal(manifest.libc, libc);
      assert.equal(manifest.binary, file);
      assert.equal(manifest.workflowRunId, '456');
      assert.equal(manifest.workflowRunAttempt, '3');
    });
  });

  if (libc === 'musl') continue;
  test(`keeps libc optional for existing ${file} API and four-argument CLI calls`, async () => {
    await fixture(async dir => {
      const { archiveCandidateBinary } = await load;
      const binaryPath = join(dir, file);
      await writeFile(binaryPath, 'candidate bytes');
      const target = `node24.14.1-${platform}`;
      for (const omittedLibc of [undefined, '']) {
        await archiveCandidateBinary({
          binaryPath,
          target,
          libc: omittedLibc,
          sha,
          version: '1.2.3',
          outputDirectory: dir,
          runId: '123',
          runAttempt: '1',
        });
        const manifest = JSON.parse(
          await readFile(`${binaryPath}.manifest.json`, 'utf8')
        );
        assert.equal(manifest.libc, libc);
        assert.equal(manifest.binary, file);
      }
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'archive-candidate-binary.mjs'),
          binaryPath,
          target,
          sha,
          dir,
        ],
        {
          cwd: dir,
          env: {
            ...process.env,
            GITHUB_RUN_ID: '123',
            GITHUB_RUN_ATTEMPT: '1',
          },
        }
      );
      const manifest = JSON.parse(
        await readFile(`${binaryPath}.manifest.json`, 'utf8')
      );
      assert.equal(manifest.libc, libc);
      assert.equal(manifest.cliVersion, cliVersion);
    });
  });
}

for (const [label, override, message] of [
  ['branch ref', { sha: 'main' }, /candidate SHA/],
  ['non-exact target', { target: 'host' }, /native Node target/],
  [
    'target with trailing newline',
    { target: 'node24.14.1-linux-x64\n' },
    /native Node target/,
  ],
  [
    'non-string target',
    { target: ['node24.14.1-linux-x64'] },
    /native Node target/,
  ],
  [
    'unsupported architecture',
    { target: 'node24.14.1-linux-ia32' },
    /native Node target/,
  ],
  [
    'unsupported OS',
    { target: 'node24.14.1-alpine-x64' },
    /native Node target/,
  ],
  [
    'libc in target',
    { target: 'node24.14.1-linux-x64-musl', libc: 'musl' },
    /native Node target/,
  ],
  ['unknown libc', { libc: 'uclibc' }, /libc/],
  ['non-string libc', { libc: false }, /libc/],
  ['null Linux libc', { libc: null }, /libc/],
  ['musl on macOS', { target: 'node24.14.1-macos-x64', libc: 'musl' }, /libc/],
  [
    'glibc on macOS',
    { target: 'node24.14.1-macos-x64', libc: 'glibc' },
    /libc/,
  ],
  ['musl on Windows', { target: 'node24.14.1-win-x64', libc: 'musl' }, /libc/],
  [
    'glibc on Windows',
    { target: 'node24.14.1-win-x64', libc: 'glibc' },
    /libc/,
  ],
  ['musl without filename suffix', { libc: 'musl' }, /filename/],
  [
    'musl filename without libc',
    { binaryPath: 'vercel-linux-x64-musl' },
    /filename/,
  ],
  [
    'musl filename with glibc',
    { binaryPath: 'vercel-linux-x64-musl', libc: 'glibc' },
    /filename/,
  ],
  [
    'wrong musl architecture',
    { binaryPath: 'vercel-linux-arm64-musl', libc: 'musl' },
    /filename/,
  ],
  ['wrong filename', { target: 'node24.14.1-macos-x64' }, /filename/],
  ['missing version', { version: '' }, /CLI version/],
  ['missing run ID', { runId: '' }, /run ID and attempt/],
  ['invalid attempt', { runAttempt: '0' }, /run ID and attempt/],
]) {
  test(`refuses ${label} before producing an artifact`, async () => {
    const { archiveCandidateBinary } = await load;
    await assert.rejects(
      archiveCandidateBinary({
        binaryPath: 'vercel-linux-x64',
        target: 'node24.14.1-linux-x64',
        sha,
        version: '1.2.3',
        outputDirectory: 'unused',
        runId: '123',
        runAttempt: '1',
        ...override,
      }),
      message
    );
  });
}

for (const isDirectory of [false, true]) {
  test(`rejects ${isDirectory ? 'directories' : 'empty binaries'}`, async () => {
    await fixture(async dir => {
      const { archiveCandidateBinary } = await load;
      const binaryPath = join(dir, 'vercel-linux-x64');
      if (isDirectory) await mkdir(binaryPath);
      else await writeFile(binaryPath, '');
      await assert.rejects(
        archiveCandidateBinary({
          binaryPath,
          target: 'node24.14.1-linux-x64',
          sha,
          version: '1.2.3',
          outputDirectory: dir,
          runId: '123',
          runAttempt: '1',
        }),
        /nonempty regular binary/
      );
    });
  });
}

const workflow = file =>
  readFileSync(join(__dirname, '..', '.github/workflows', file), 'utf8');
const binary = workflow('candidate-binaries.yml');
const ci = workflow('test.yml');

test('candidate binaries are built by Manual Version Packages, not PR CI', () => {
  assert.doesNotMatch(ci, /candidate-binaries/);
  const preparation = workflow('version-packages.yml');
  const caller = preparation
    .split('  build-binaries:\n')[1]
    .split('\n  assemble:')[0];
  assert.match(caller, /needs: version/);
  assert.match(
    caller,
    /ref: \$\{\{ needs\.version\.outputs\.candidateSha \}\}/
  );
  assert.match(caller, /uses: .\/.github\/workflows\/candidate-binaries.yml/);
});

test('exact source is smoke-tested before uploading SHA-labelled build-only archives', () => {
  assert.match(binary, /ref: \$\{\{ inputs.ref \}\}/);
  assert.match(binary, /git rev-parse HEAD/);
  assert.match(binary, /scripts\/build-binary.mjs --target/);
  assert.match(binary, /scripts\/check-binary-glibc.mjs .* 2.28/);
  assert.match(binary, /scripts\/smoke-test-binary.mjs/);
  assert.match(
    binary,
    /name: candidate-binary-\$\{\{ inputs.ref \}\}-\$\{\{ matrix.asset \}\}-attempt-\$\{\{ github.run_attempt \}\}/
  );
  assert.match(
    binary,
    /path: \$\{\{ runner.temp \}\}\/\$\{\{ matrix.asset \}\}\$\{\{ matrix.ext \}\}.tar.gz/
  );
  assert.match(binary, /if-no-files-found: error/);
  assert.match(binary, /retention-days: 30/);
  // All eight binaries build at once, for the version PR and the release build.
  assert.doesNotMatch(binary, /max-parallel/);
  assert.ok(
    binary.indexOf('name: Smoke test') <
      binary.indexOf('uses: actions/upload-artifact')
  );
});

test('fanout signs macOS builds for release, has no OIDC, and does not publish', () => {
  assert.match(binary, /on:\n {2}workflow_call:/);
  assert.doesNotMatch(binary, /id-token|remote-cache|TURBO_TEAM|inputs\.sign/);
  assert.match(
    binary,
    /environment: \$\{\{ matrix\.sign && 'code-signing' \|\| fromJSON\('null'\) \}\}/
  );
  assert.equal((binary.match(/if: matrix\.sign$/gm) || []).length, 2);
  assert.doesNotMatch(
    binary,
    /workflow_dispatch:|pull_request:|contents: write|secrets: inherit|NPM_TOKEN|npm publish|ci:publish|publish-packages|pr-binaries-token|VERCEL_CLI_PREVIEW_TARBALL_BASE_URL|VERCEL_CLI_BUILD_LABEL/
  );
  assert.doesNotMatch(
    readFileSync(join(__dirname, '..', '.github/workflows/test.yml'), 'utf8'),
    /sign: true/
  );
  assert.doesNotMatch(binary, /uses: .*re(?:a)?lease(?:-binary)?\.yml/);
  assert.match(binary, /persist-credentials: false/);
});
