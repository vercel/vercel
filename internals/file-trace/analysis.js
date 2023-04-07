const fs = require('fs');
const { join } = require('path');
const { createHash } = require('crypto');
// const path = require('path');
const fileGraphData = JSON.parse(fs.readFileSync('./fileGraph.json', 'utf-8'));
// const entries = [...Object.entries(fileGraph)]

// get all output files
// const outputDir = entries.filter(
//   ([filePath]) => path.dirname(filePath).endsWith('output')
// )

// console.log(outputDir);

// const allFilesDependentOnPkg = entries.filter(
//   ([,{dependsOn}]) => dependsOn.includes('/Users/ethanarrowood/Documents/github/vercel/vercel/packages/cli/src/util/pkg.ts')
// )

// console.log(allFilesDependentOnPkg.map(([_]) => _))

// console.log("Files with 0 dependencies:")

// const zeroDeps = entries
//   .filter(([, { dependsOn }]) => dependsOn.length === 0)
//   .map(([p]) => p);

// console.log(zeroDeps)

const rootPath = '/Users/ethanarrowood/Documents/github/vercel/vercel/packages/cli/src/';

// class IDController {
//   constructor() {
//     this.id = 0;
//   }
//   getID () {
//     return this.id++;
//   }
// }

// const idController = new IDController();

// const nodes = [];

// const nodeCache = new Map();

// class Node {
//   constructor (path) {
//     this.id = `node-${idController.getID()}`;
//     this.path = path;
//     this.name = path.replace(rootPath, '')
//     this.dependsOn = [];
//   }
// }

// function createNode (path) {
//   let node = nodeCache.get(path);

//   if (!node) {
//     node = new Node(path);
//     nodeCache.set(path, node);
//     nodes.push(node);
//   }

//   return node;
// }

// for (const path of Object.keys(fileGraphData)) {
//   createNode(path);
// }


// let mermaid = 'graph LR\n'

// const hasAnalyzed = new Set();

// function f (i) {
//   const n = nodeCache.get(i);
//   if (hasAnalyzed.has(n.id)) return;
//   else hasAnalyzed.add(n.id);
//   for (const j of fileGraphData[n.path].dependsOn) {
//     const nn = nodeCache.get(j);
//     if (!nn) continue;
//     n.dependsOn.push(nn);
//     mermaid += line(n, nn);
//     f(nn.path);
//   }
// }

// f(i);
// console.log(nodeCache.get(i))

// console.log(mermaid)

const i = join(rootPath, 'index.ts')

const name = p => p.replace(rootPath, '');
const hash = p => {
  const h = createHash('sha1');
  h.update(p);
  return h.digest('hex');
}
const line = (p1, p2) => ` ${hash(p1)}(${name(p1)}) --> ${hash(p2)}(${name(p2)})\n`
function m (i) {
  const v = new Set();
  let o = 'graph LR\n';
  function _m (p) {
    if (!fileGraphData[p]) return;
    if (v.has(hash(p))) return;
    else v.add(hash(p));
    for (const d of fileGraphData[p].dependsOn) {
      o += line(p, d);
      _m(d);
    }
  }
  _m(i);
  return o;
}

let result = m(i);
fs.writeFileSync('file-graph.mmd', result);
