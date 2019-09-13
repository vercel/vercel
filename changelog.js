const { execSync } = require('child_process');
const prevCommit = execSync('git log --pretty=format:"%s %H" | grep "^Publish" | head -n 1').toString().trim().split(' ').pop();
const changelog = execSync(`git log --pretty=format:"- %s [%an]" ${prevCommit}...HEAD`).toString().trim();
console.log(`Changes since the last publish commit ${prevCommit}:\n\n${changelog}\n`);
