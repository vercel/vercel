const fs = require('fs');
const path = require('path');

const docs = path.join(__dirname, '..', 'docs');
const interfaces = path.join(docs, 'interfaces');

console.log(`Fixing links in ${docs} and ${interfaces}`);

for (const dir of [docs, interfaces]) {
  for (const entity of fs.readdirSync(dir)) {
    try {
      const entityPath = path.join(dir, entity);
      const stat = fs.statSync(entityPath);

      if (stat.isFile()) {
        const contents = fs.readFileSync(entityPath, 'utf-8');
        const pattern = /node_modules\/\.pnpm\/typescript@\d*\.\d*\.\d*\//gi;
        fs.writeFileSync(entityPath, contents.replaceAll(pattern, ''));
      }
    } catch (e) {
      console.error('Error fixing links in docs', e);
    }
  }
}
