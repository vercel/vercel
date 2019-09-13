const { execSync } = require('child_process');
const { join } = require('path');
const { tmpdir } = require('os');
const { mkdirSync, writeFileSync } = require('fs');

function main(count = '100') {
  console.log(`Generating diff using last ${count} commits...`);
  const randomTmpId = Math.random().toString().slice(2);
  const dir = join(tmpdir(), 'now-diff' + randomTmpId);
  mkdirSync(dir);

  execSync('git checkout canary && git pull').toString();
  const canary = execSync('git log --pretty=format:"%s [%an]" | grep -v "^Publish" | head -n ' + count).toString().trim();
  execSync('git checkout master && git pull').toString();
  const master = execSync('git log --pretty=format:"%s [%an]" | grep -v "^Publish" | head -n ' + count).toString().trim();

  writeFileSync(join(dir, 'log.txt'), '# canary\n' + canary);
  execSync('git init && git add -A && git commit -m "init"', { cwd: dir }).toString();
  writeFileSync(join(dir, 'log.txt'), '# master\n' + master);

  console.log(`Done generating diff. Run the following:`);
  console.log(`cd ${dir}`);
  console.log('Then use `git diff` or `git difftool` to view the differences.');
}

main(process.argv[2]);
