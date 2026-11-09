import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Build-only packaging. These metadata files describe the bytes; they do not
// authorize signing or publication. A future consumer must verify the CI run.
export async function archiveCandidateBinary({
  binaryPath,
  target,
  libc,
  sha,
  version,
  outputDirectory,
  runId = process.env.GITHUB_RUN_ID,
  runAttempt = process.env.GITHUB_RUN_ATTEMPT,
}) {
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('Expected an exact candidate SHA');
  }
  const platform =
    typeof target === 'string' &&
    /^node\d+\.\d+\.\d+-(macos|linux|win)-(arm64|x64)$/.exec(target);
  if (!platform || platform[0] !== target) {
    throw new Error('Expected an exact native Node target');
  }
  if (typeof version !== 'string' || !version.trim()) {
    throw new Error('Expected the candidate CLI version');
  }
  for (const value of [runId, runAttempt]) {
    if (!/^[1-9]\d*$/.test(value || '')) {
      throw new Error('Expected the GitHub run ID and attempt');
    }
  }
  const os = { macos: 'darwin', linux: 'linux', win: 'windows' }[platform[1]];
  // Old four-argument calls omit libc; an unset matrix value arrives as ''.
  // Never infer musl from the filename: libc and the target must agree with it.
  if (libc === undefined || libc === '') {
    libc = os === 'linux' ? 'glibc' : null;
  }
  if (os === 'linux' ? !['glibc', 'musl'].includes(libc) : libc !== null) {
    throw new Error(
      'Expected libc glibc or musl for Linux, and no libc otherwise'
    );
  }
  const suffix = libc === 'musl' ? '-musl' : os === 'windows' ? '.exe' : '';
  const file = `vercel-${os}-${platform[2]}${suffix}`;
  if (basename(binaryPath) !== file) {
    throw new Error('Binary filename does not match the target');
  }
  const binary = resolve(binaryPath);
  const stat = await lstat(binary);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error('Expected a nonempty regular binary file');
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(binary)) hash.update(chunk);
  const sha256 = hash.digest('hex');
  await chmod(binary, 0o755);
  await writeFile(`${binary}.sha256`, `${sha256}  ${file}\n`);
  await writeFile(
    `${binary}.manifest.json`,
    JSON.stringify(
      {
        schemaVersion: 1,
        sourceSha: sha,
        cliVersion: version,
        target,
        libc,
        binary: file,
        sha256,
        size: stat.size,
        releaseSigned: false,
        workflowRunId: String(runId),
        workflowRunAttempt: String(runAttempt),
      },
      null,
      2
    ) + '\n'
  );
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  // Use Windows' native bsdtar rather than whichever MSYS tar is first in PATH.
  const tar =
    process.platform === 'win32'
      ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar';
  const archive = `${file}.tar.gz`;
  await execFileAsync(
    tar,
    [
      '-czf',
      archive,
      '-C',
      dirname(binary),
      file,
      `${file}.sha256`,
      `${file}.manifest.json`,
    ],
    {
      cwd: output,
      // macOS bsdtar otherwise adds AppleDouble ._ members for extended metadata,
      // violating the verifier's exact three-file archive contract.
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    }
  );
  return join(output, archive);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [binaryPath, target, sha, outputDirectory, libc] =
    process.argv.slice(2);
  try {
    const { version } = JSON.parse(
      await readFile(
        new URL('../packages/cli/package.json', import.meta.url),
        'utf8'
      )
    );
    console.log(
      await archiveCandidateBinary({
        binaryPath,
        target,
        libc,
        sha,
        outputDirectory,
        version,
      })
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
