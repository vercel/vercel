const fs = require('fs');
const path = require('path');

for (let i = 100; i < 400; i += 1) {
  const file = path.join(__dirname, `dist/${i}.html`);
  fs.writeFileSync(file, `<h1>Number ${i}:RANDOMNESS_PLACEHOLDER</h1>`);
}
