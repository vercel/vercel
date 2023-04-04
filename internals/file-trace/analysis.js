const fs = require('fs');
const path = require('path');
const fileGraph = JSON.parse(fs.readFileSync('./fileGraph.json', 'utf-8'));
const entries = [...Object.entries(fileGraph)]

// get all output files
const outputDir = entries.filter(
  ([filePath]) => path.dirname(filePath).endsWith('output')
)

// console.log(outputDir);

const allFilesDependentOnPkg = entries.filter(
  ([,{dependsOn}]) => dependsOn.includes('/Users/ethanarrowood/Documents/github/vercel/vercel/packages/cli/src/util/pkg.ts')
)

console.log(allFilesDependentOnPkg.map(([_]) => _))

// console.log("Files with 0 dependencies:")

// const zeroDeps = entries
//   .filter(([, { dependsOn }]) => dependsOn.length === 0)
//   .map(([p]) => p);

// console.log(zeroDeps)
