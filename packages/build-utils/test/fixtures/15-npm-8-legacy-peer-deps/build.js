function checkPkgOrThrow(pkgname) {
  try {
    const dep = require(pkgname);
    if (!dep) {
      throw new Error('Undefined');
    }
  } catch (e) {
    console.error(`Expected package "${pkgname}" to be installed.`);
    process.exit(1);
  }
}

const { execSync } = require('child_process');
const { writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const public = join(__dirname, 'public');
mkdirSync(public, { recursive: true });
execSync('corepack enable npm'); // ensure we can select npm version

writeFileSync(
  join(__dirname, 'public'),
  '{"packageManager":"npm@8.5.5","dependencies":{"next":"12.3.0","react":"16.8.0"}}'
);
execSync('npm --version', { cwd: public });
execSync('npm install --legacy-peer-deps', { cwd: public });

writeFileSync(
  join(__dirname, 'public'),
  '{"packageManager":"npm@8.6.5","dependencies":{"next":"12.3.0","react":"16.8.0"}}'
);
execSync('npm install', { cwd: public });
