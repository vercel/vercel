#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

async function main() {
  console.log(
    JSON.stringify(
      {
        cwd: process.cwd(),
        dirname: __dirname,
        filesInCurrent: fs.readdirSync(__dirname),
        filesInParent: fs.readdirSync(path.join(__dirname, '..')),
      },
      null,
      2
    )
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
