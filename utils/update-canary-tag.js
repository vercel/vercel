const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const changedFiles = execSync('git diff HEAD~ --name-only')
  .toString()
  .split('\n')
  .map(file => file.trim());

const changedPackageVersions = new Map();

for (const file of changedFiles) {
  if (file.match(/packages\/.+\/package.json/)) {
    const packageData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    );
    changedPackageVersions.set(packageData.name, packageData.version);
  }
}

for (const [package, version] of changedPackageVersions) {
  if (version.includes('canary')) {
    console.log(
      `skipping ${package}@${version} as it is already a canary version`
    );
  } else {
    console.log(
      execSync(`npm dist-tag add ${package}@${version} canary`).toString()
    );
    console.log(`updated canary dist-tag for ${package}@${version}`);
  }
}
