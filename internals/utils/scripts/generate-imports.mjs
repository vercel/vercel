const input = process.argv[2];

const patterns = [/import\s+{([^}]*)}\s+from/g, /import\s+([^{].*)\s+from/g];
const imports = [];

for (const pattern of patterns) {
  const matches = input.matchAll(pattern);

  for (let match of matches) {
    match = match[1].replaceAll('\n', '');
    if (match.includes(',')) {
      for (let i of match.split(',')) {
        i = i.trim();
        if (i === '') continue;
        else imports.push(i);
      }
    } else if (match.includes('* as')) {
      imports.push(match.substring(4).trim())
    } else {
      imports.push(match.trim());
    }
  }
}

console.log(`import { ${imports.join(', ')} } from '@vercel-internals/utils';`)

