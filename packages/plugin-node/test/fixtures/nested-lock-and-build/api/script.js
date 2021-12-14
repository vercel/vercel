const fs = require('fs');
const path = require('path');

fs.writeFileSync(
  path.join(__dirname, 'users', '.date.js'),
  `
module.exports = {
  date: '2021-11-20T20:00:00.000Z'
};
`.trim()
);
