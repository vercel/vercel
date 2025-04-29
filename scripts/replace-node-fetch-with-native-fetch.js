#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cliPath = path.join(__dirname, '../packages/cli');

const output = execSync(`grep -r "node-fetch" --include="*.js" --include="*.ts" src/`, {
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

console.log(`Found ${filePaths.length} files using node-fetch`);

let totalReplacements = 0;
filePaths.forEach(filePath => {
  const fullPath = path.join(cliPath, filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  let replacements = 0;

  const importReplacements = [
    [/import fetch from ['"]node-fetch['"]/g, '// Native fetch is available in Node.js 18+'],
    [/import fetch, \{([^}]+)\} from ['"]node-fetch['"]/g, '// Native fetch is available in Node.js 18+\nimport type {$1} from "node:http"'],
    
    [/import type \{ Response \} from ['"]node-fetch['"]/g, 'import type { Response } from "node:http"'],
    [/import type \{([^}]+)\} from ['"]node-fetch['"]/g, 'import type {$1} from "node:http"'],
    
    [/import \{ Headers \} from ['"]node-fetch['"]/g, '// Native Headers is available in Node.js 18+'],
    
    [/const fetch = require\(['"]node-fetch['"]\)/g, '// Native fetch is available in Node.js 18+'],
    [/const \{ Headers \} = require\(['"]node-fetch['"]\)/g, '// Native Headers is available in Node.js 18+']
  ];

  for (const [pattern, replacement] of importReplacements) {
    const newContent = content.replace(pattern, replacement);
    if (newContent !== content) {
      content = newContent;
      replacements++;
    }
  }

  content = content.replace(/(\w+)\.buffer\(\)/g, 'Buffer.from(await $1.arrayBuffer())');

  if (replacements > 0 || content.includes('Buffer.from(await')) {
    fs.writeFileSync(fullPath, content);
    console.log(`Updated ${filePath} with ${replacements} import replacements`);
    totalReplacements += replacements;
  }
});

console.log(`Total replacements: ${totalReplacements}`);
console.log('Done replacing node-fetch with native fetch');
