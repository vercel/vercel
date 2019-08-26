const { execSync, spawn } = require('child_process');
const { join, relative } = require('path');
const { readdirSync } = require('fs');

const script = process.argv[2];
const all = process.argv[3];
let matches = [];

if (!script) {
  console.error('Please provide at least one argument');
  process.exit(2);
}

if (all) {
  matches = readdirSync(join(__dirname, 'packages'));
  console.log(`Running ${script} on all packages`)
} else {
  const branch = execSync('git branch | grep "*" | cut -d " " -f2')
    .toString()
    .trim();

  const gitPath = branch === 'master' ? 'HEAD~1' : 'origin/canary...HEAD';
  const diff = execSync(`git diff ${gitPath} --name-only`).toString();

  const changed = diff
    .split('\n')
    .filter(item => Boolean(item) && item.includes('packages/'))
    .map(item => relative('packages', item).split('/')[0]);
  
  matches = Array.from(new Set(changed));

  if (matches.length === 0) {
    matches.push('now-cli');
    matches.push('now-node');
    console.log('No packages changed. Using default packages.');
  }

  console.log(`Running ${script} on branch "${branch}" with the following packages:`);
}

console.log(matches.join('\n'));



function runScript(pkgName, script) {
  return new Promise((resolve, reject) => {
    let pkgJson = null;
    try {
      pkgJson = require(join(__dirname, 'packages', pkgName, 'package.json'));
    } catch(e) {
      pkgJson = null;
    }
    if (pkgJson && pkgJson.scripts && pkgJson.scripts[script]) {
      const cwd = join(__dirname, 'packages', pkgName);
      console.log(`From ${cwd}, executing yarn ${script}`);
      const child = spawn('yarn', [script], { cwd, stdio: 'inherit' });
      child.on('error', reject);
      child.on('close', (code, signal) => {
        if (code === 0) {
          return resolve();
        }
        reject(new Error(`Exited with ${code || signal}`));
      });
    }
  });
}

const promises = matches.map(async pkgName => {
  await runScript(pkgName, script);
  console.log('completed ' + pkgName);
});

Promise.all(promises)
  .then(() => {
    console.log('Done.')
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
