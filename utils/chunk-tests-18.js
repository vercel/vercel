async function main() {
  try {
    console.log(
      JSON.stringify([
        {
          runner: 'ubuntu-latest',
          packagePath: 'packages/node',
          packageName: '@vercel/node',
          scriptName: 'test-unit',
          testScript: 'test',
          testPaths: ['test/unit/dev.test.ts'],
          chunkNumber: 1,
          allChunksLength: 1,
        },
        {
          runner: 'macos-14',
          packagePath: 'packages/node',
          packageName: '@vercel/node',
          scriptName: 'test-unit',
          testScript: 'test',
          testPaths: ['test/unit/dev.test.ts'],
          chunkNumber: 1,
          allChunksLength: 1,
        },
        {
          runner: 'windows-latest',
          packagePath: 'packages/node',
          packageName: '@vercel/node',
          scriptName: 'test-unit',
          testScript: 'test',
          testPaths: ['test/unit/dev.test.ts'],
          chunkNumber: 1,
          allChunksLength: 1,
        },
      ])
    );
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
}

// @ts-ignore
if (module === require.main || !module.parent) {
  main();
}
