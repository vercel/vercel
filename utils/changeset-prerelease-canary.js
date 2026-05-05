const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const preStatePath = path.join(root, '.changeset', 'pre.json');
const forcePackage = process.env.CANARY_PRERELEASE_PACKAGE;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with ${result.status}`
    );
  }
}

function ensureCanaryPreState() {
  if (!fs.existsSync(preStatePath)) {
    run('pnpm', ['changeset', 'pre', 'enter', 'canary']);
    return;
  }

  const preState = JSON.parse(fs.readFileSync(preStatePath, 'utf8'));

  if (preState.mode !== 'pre' || preState.tag !== 'canary') {
    throw new Error(
      `.changeset/pre.json is already configured for ${preState.mode}:${preState.tag}; expected pre:canary`
    );
  }
}

function createForcedChangeset() {
  if (!forcePackage) {
    return;
  }

  const fileName = `canary-prerelease-${Date.now()}.md`;
  const changesetPath = path.join(root, '.changeset', fileName);
  const contents = `---\n'${forcePackage}': patch\n---\n\nForced canary prerelease for ${forcePackage}.\n`;

  fs.writeFileSync(changesetPath, contents);
  console.log(`Created ${path.relative(root, changesetPath)}`);
}

function main() {
  ensureCanaryPreState();
  createForcedChangeset();

  run('pnpm', ['changeset', 'version']);
  run('node', ['utils/sync-python-version.js', '--pep440-prerelease']);
  run('uv', ['lock']);
  run('pnpm', ['install', '--no-frozen-lockfile']);
}

main();
