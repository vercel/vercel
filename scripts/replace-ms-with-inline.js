#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cliPath = path.join(__dirname, '../packages/cli');

const output = execSync(`grep -r "import ms from 'ms'" --include="*.ts" src/`, {
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

console.log(`Found ${filePaths.length} files using ms`);

let totalReplacements = 0;
filePaths.forEach(filePath => {
  const fullPath = path.join(cliPath, filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  
  const relativePath = path.relative(path.dirname(fullPath), path.join(cliPath, 'src/util/inline')).replace(/\\/g, '/');
  const importPath = relativePath ? `${relativePath}/ms` : './inline/ms';
  
  const newContent = content.replace(/import\s+ms\s+from\s+['"]ms['"]/g, `import ms from '${importPath}'`);
  
  if (newContent !== content) {
    fs.writeFileSync(fullPath, newContent);
    console.log(`Updated ${filePath} with import from ${importPath}`);
    totalReplacements++;
  }
});

console.log(`Total replacements: ${totalReplacements}`);
console.log('Done replacing ms with inlined version');
