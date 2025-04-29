#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cliPath = path.join(__dirname, '../packages/cli');

const output = execSync(`grep -r "chalk" --include="*.js" --include="*.ts" src/`, {
  cwd: cliPath,
  encoding: 'utf8',
}).toString();

const filePaths = [...new Set(
  output.split('\n')
    .filter(line => line.trim())
    .map(line => {
      const match = line.match(/^([^:]+):/);
      return match ? match[1] : null;
    })
    .filter(Boolean)
)];

console.log(`Found ${filePaths.length} files using chalk`);

let totalReplacements = 0;
filePaths.forEach(filePath => {
  const fullPath = path.join(cliPath, filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  let replacements = 0;

  const importReplacements = [
    [/import\s+chalk\s+from\s+'chalk';/g, "import pc from 'picocolors';"],
    
    [/import\s+\{\s*([^}]+)\s*\}\s+from\s+'chalk';/g, "import { $1 } from 'picocolors';"],
    
    [/import\s+chalk,\s*\{\s*type\s+Chalk\s*\}\s+from\s+'chalk';/g, "import pc from 'picocolors';"],
    
    [/const\s+chalk\s+=\s+require\('chalk'\);/g, "const pc = require('picocolors');"],
    
    [/import\s+([a-zA-Z]+)\s+from\s+'chalk';/g, "import $1 from 'picocolors';"]
  ];

  for (const [pattern, replacement] of importReplacements) {
    const newContent = content.replace(pattern, replacement);
    if (newContent !== content) {
      content = newContent;
      replacements++;
    }
  }

  content = content.replace(/chalk\./g, 'pc.');

  content = content.replace(/chalk\.level/g, '0'); // picocolors doesn't have levels

  if (replacements > 0 || content.includes('pc.')) {
    fs.writeFileSync(fullPath, content);
    console.log(`Updated ${filePath} with ${replacements} import replacements`);
    totalReplacements += replacements;
  }
});

console.log(`Total replacements: ${totalReplacements}`);
console.log('Done replacing chalk with picocolors');
