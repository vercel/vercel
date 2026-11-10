const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const root = path.join(__dirname, '..');
const toolchainFile = path.join(root, 'utils/vercel-ci-toolchain.json');
const workflowsDir = path.join(root, '.github/workflows');

const relative = file => path.relative(root, file);

// `utils/vercel-ci-install.sh` installs these tools for Vercel CI, and GitHub
// Actions installs them through `.github/workflows`. A test that passes in one
// CI and fails in the other is hard to debug, so both must use the same
// versions. Workflows cannot read this JSON file: they come from the merge ref,
// while `utils/` comes from the PR head. This test enforces the match instead.
function readToolchain() {
  return JSON.parse(fs.readFileSync(toolchainFile, 'utf8'));
}

function* workflowSteps() {
  for (const name of fs.readdirSync(workflowsDir).sort()) {
    if (!/\.ya?ml$/.test(name)) continue;
    const workflow = YAML.parse(
      fs.readFileSync(path.join(workflowsDir, name), 'utf8')
    );
    for (const [jobId, job] of Object.entries(workflow?.jobs ?? {})) {
      for (const [index, step] of (job?.steps ?? []).entries()) {
        const label = step.name ?? step.uses ?? `#${index + 1}`;
        yield { location: `${name} › job "${jobId}" › step "${label}"`, step };
      }
    }
  }
}

function actionPins(actionPrefix, input) {
  const pins = [];
  for (const { location, step } of workflowSteps()) {
    if (typeof step.uses !== 'string' || !step.uses.startsWith(actionPrefix)) {
      continue;
    }
    pins.push({ location, version: step.with?.[input] });
  }
  return pins;
}

function runPins(pattern) {
  const pins = [];
  for (const { location, step } of workflowSteps()) {
    if (typeof step.run !== 'string') continue;
    for (const match of step.run.matchAll(pattern)) {
      pins.push({ location, version: match[1] });
    }
  }
  return pins;
}

function driftMessage(tool, key, expected, mismatches, hint) {
  return [
    `${tool} version drift: ${relative(toolchainFile)} has ${key} ${expected}, but:`,
    ...mismatches.map(
      pin => `  ${pin.location} has ${pin.version ?? '(no version)'}`
    ),
    `Make them match.${hint ? ` ${hint}` : ''}`,
  ].join('\n');
}

function readRootPackageJson() {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
}

// Global `npm i -g <tool>@<version>` installs in workflow run steps must match
// the version the repo pins in package.json. `--prefix` installs (pinned pnpm
// 10 and 11 for the CLI upgrade checks) are deliberate and not matched.
function expectGlobalInstallsMatch({ tool, field, expected, why }) {
  const pins = runPins(
    new RegExp(`\\bnpm i(?:nstall)? -g ${tool}@(\\S+)`, 'g')
  );
  if (pins.length === 0) {
    throw new Error(
      `Found no \`npm i -g ${tool}@<version>\` installs in .github/workflows. ` +
        `If workflows stopped installing ${tool} that way, update ${relative(__filename)}.`
    );
  }
  const mismatches = pins.filter(pin => pin.version !== expected);
  if (mismatches.length > 0) {
    throw new Error(
      [
        `${tool} version drift: package.json ${field} is ${expected}, but:`,
        ...mismatches.map(
          pin => `  ${pin.location} installs ${tool}@${pin.version}`
        ),
        `Change those installs (and their step names) to ${tool}@${expected}.`,
        why,
      ].join('\n')
    );
  }
}

function expectPinsMatch({ tool, key, expected, pins, source, hint }) {
  if (pins.length === 0) {
    throw new Error(
      `Found no ${source} in .github/workflows. If workflows stopped ` +
        `installing ${tool} that way, update ${relative(__filename)}.`
    );
  }
  const mismatches = pins.filter(pin => String(pin.version) !== expected);
  if (mismatches.length > 0) {
    throw new Error(driftMessage(tool, key, expected, mismatches, hint));
  }
}

describe('Vercel CI toolchain pins', () => {
  test('vercel-ci-toolchain.json has exact versions and checksums', () => {
    const toolchain = readToolchain();
    expect(toolchain.go.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(toolchain.go.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(toolchain.uv.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(toolchain.uv.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(toolchain.python.version).toMatch(/^\d+\.\d+$/);
    expect(toolchain.yarn.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('Go matches every actions/setup-go step', () => {
    expectPinsMatch({
      tool: 'Go',
      key: 'go.version',
      expected: readToolchain().go.version,
      pins: actionPins('actions/setup-go@', 'go-version'),
      source: 'actions/setup-go steps',
      hint: 'Bump go.sha256 together with go.version.',
    });
  });

  test('uv matches every astral-sh/setup-uv step', () => {
    expectPinsMatch({
      tool: 'uv',
      key: 'uv.version',
      expected: readToolchain().uv.version,
      pins: actionPins('astral-sh/setup-uv@', 'version'),
      source: 'astral-sh/setup-uv steps',
      hint: 'Bump uv.sha256 together with uv.version.',
    });
  });

  test('yarn matches every yarn@<version> install in workflow run steps', () => {
    expectPinsMatch({
      tool: 'yarn',
      key: 'yarn.version',
      expected: readToolchain().yarn.version,
      pins: runPins(/\byarn@(\d+\.\d+\.\d+)\b/g),
      source: '`yarn@<version>` installs',
    });
  });

  // The bootstrap reads pnpm from the root `packageManager` field. GHA installs
  // it with `npm i -g pnpm@<version>`.
  test('pnpm matches every global pnpm install in workflow run steps', () => {
    const { packageManager } = readRootPackageJson();
    const expected = /^pnpm@(\d+\.\d+\.\d+)$/.exec(packageManager)?.[1];
    expect(expected).toBeDefined();
    expectGlobalInstallsMatch({
      tool: 'pnpm',
      field: 'packageManager',
      expected,
      why: 'Workflows and local runs must use the same pnpm.',
    });
  });

  // Workflows install turbo globally with `npm i -g turbo@<version>`. That
  // binary must understand the repo's turbo.json files, which are written for
  // the turbo version in package.json devDependencies. An older global turbo
  // fails to parse new keys (for example `tags`) with turbo_json_parse_error.
  test('turbo matches every global turbo install in workflow run steps', () => {
    const expected = readRootPackageJson().devDependencies?.turbo;
    expect(expected).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/);
    expectGlobalInstallsMatch({
      tool: 'turbo',
      field: 'devDependencies.turbo',
      expected,
      why:
        'A different global turbo can reject keys in turbo.json ' +
        '(turbo_json_parse_error) or compute a different task graph.',
    });
  });
});
