import path from 'path';
import fs from 'fs-extra';
import { Builder, FileFsRef, Route } from '@now/build-utils';
import { Output } from '../../util/output';

const cleanDirPart = (part: string) => part.replace(/(\/|\\)/g, '_');

export default async function runBuild({
  workDir,
  buildersDir,
  buildsOutputDir,
  build,
  files,
  output,
}: {
  workDir: string;
  buildersDir: string;
  buildsOutputDir: string;
  build: Builder;
  files: { [filePath: string]: FileFsRef };
  output: Output;
}): Promise<void> {
  output.log(`Running build: ${JSON.stringify(build)}`);
  let buildOutput: {
    routes: Route[];
    output: { [path: string]: any };
  } = {
    output: {},
    routes: [],
  };

  const builderName = build.use;
  const outputDir = path.join(
    buildsOutputDir,
    `${cleanDirPart(build.src)}-${cleanDirPart(builderName)}`
  );

  await fs.remove(outputDir);
  await fs.ensureDir(outputDir);

  if (build.use === '@now/static') {
    // the source is the output for @now/static
    buildOutput.output = {
      [build.src]: files[build.src],
    };
  } else {
    const builderPath = path.join(buildersDir, 'node_modules', builderName);
    const builder = require(builderPath);

    buildOutput = await builder.build({
      files,
      workPath: workDir,
      entrypoint: build.src,
      config: build.config || {},
    });
  }
  const outputKeys = Object.keys(buildOutput.output);
  const dirNames = new Set(outputKeys.map(p => path.dirname(p)));

  // omit zipBuffer from API route output
  if (buildOutput.output && buildOutput.output.zipBuffer) {
    const itemPath = path.join(outputDir, build.src)
    await fs.ensureDir(path.dirname(itemPath))

    await fs.writeFile(
      itemPath,
      buildOutput.output.zipBuffer
    );
    buildOutput.output.zipBuffer = 'OMITTED'
  }

  for (const outputKey of outputKeys) {
    const item = buildOutput.output[outputKey];

    if (!item) {
      // ignore memory and maxDuration fields
      continue
    }

    let itemPath = path.join(outputDir, outputKey);

    if (dirNames.has(outputKey)) {
      itemPath = path.join(itemPath, 'index');
    }

    await fs.ensureDir(path.dirname(itemPath));

    if (item.type === 'Lambda') {
      await fs.writeFile(itemPath, item.zipBuffer);
      item.zipBuffer = 'OMITTED';
    } else if (item.type === 'Prerender' && item.lambda) {
      await fs.writeFile(itemPath, item.lambda.zipBuffer);
      item.lambda.zipBuffer = 'OMITTED';
    } else if (item.type === 'FileFsRef') {
      const writeStream = fs.createWriteStream(itemPath);
      item.toStream().pipe(writeStream);
    }
  }

  await fs.writeFile(
    path.join(outputDir, 'output.json'),
    JSON.stringify(buildOutput, null, 2)
  );
}
