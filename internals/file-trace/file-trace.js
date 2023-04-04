import swc from '@swc/core';
import path from 'path';
import fs from 'fs';

const getPath = (f) => path.resolve(path.join('./../../packages/cli/src', f));

const files = {}

async function f (filePath) {
  console.log(filePath);
  if (!filePath.endsWith('.ts')) {
    try {
      fs.statSync(filePath);
      filePath += '/index.ts';
    } catch (e) {
      filePath += '.ts';
    }
  }
  console.log(filePath);
  const source = await swc.transformFile(filePath, {
    jsc: {
      parser: {
        syntax: 'typescript'
      }
    }
  })

  const matches = source.code.matchAll(/import.*\n/g);

  const localDepPaths = [...matches]
    .map(a => a[0])
    .map(b => /"(\..*)"/.exec(b))
    .filter(c => c != null)
    .map(d => d[1]);

  files[filePath] = { dependsOn: localDepPaths };

  for (const localDepPath of localDepPaths) {
    let p = getPath(path.resolve(filePath, localDepPath))
    console.log(p);
    await f(localDepPath);
  }
}

await f(getPath('index.ts'));

console.log(files);

// const result = await nodeFileTrace(
//   [
//     './../../packages/cli/src/index.ts'
//   ],
//   {
//     base: './../../',
//     ts: true,
//     mixedModules: true,
//     ignore: ['./**/node_modules/**/*'],
//     async readFile (fsPath) {
//       let source;
//       if (fsPath.endsWith('.ts')) {
//         const result = await swc.transformFile(fsPath, {
//           isModule: true,
//           jsc: {
//             parser: {
//               syntax: "typescript",
//             },
//           },
//         });
//         source = result.code;
//       } else {
//         source = fs.readFileSync(fsPath, 'utf-8');
//       }
//       return source;
//     },
//     // resolve () {
//     //   console.log(arguments);
//     // }
//   }
// );
// console.log(result);
