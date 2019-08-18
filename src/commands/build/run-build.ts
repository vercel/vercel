import path from 'path'
import fs from 'fs-extra'
import npa from 'npm-package-arg'
import resolveFrom from 'resolve-from'
import { Builder, FileFsRef } from '@now/build-utils'
import { Output } from '../../util/output'

const cleanDirPart = (part: string) => part.replace(/(\/|\\)/g, '_')

export default async function runBuild({
  workDir,
  buildersDir,
  buildsOutputDir,
  build,
  files,
  output
}: {
  workDir: string,
  buildersDir: string,
  buildsOutputDir: string,
  build: Builder,
  files: { [filePath: string]: FileFsRef },
  output: Output
}): Promise<void> {
  output.log(`Running build: ${JSON.stringify(build)}`)
  const builderInfo = npa(build.use)
  const builderName = builderInfo.name || ''
  const builderPath = resolveFrom(buildersDir, builderName)
  const builder = require(builderPath)

  const outputDir = path.join(buildsOutputDir, `${
    cleanDirPart(build.src)
  }-${
    cleanDirPart(builderName)
  }`)
  await fs.remove(outputDir)
  await fs.ensureDir(outputDir)

  const buildOutput = await builder.build({
    files,
    entrypoint: build.src,
    workPath: workDir,
    config: build.config
  })

  const outputKeys = Object.keys(buildOutput.output)
  const dirNames = new Set(outputKeys.map(p => path.dirname(p)))

  for (const outputKey of outputKeys) {
    const item = buildOutput.output[outputKey]
    let itemPath = path.join(outputDir, outputKey)

    if (dirNames.has(outputKey)) {
      itemPath = path.join(itemPath, 'index')
    }

    await fs.ensureDir(path.dirname(itemPath))

    if (item.type === 'Lambda') {
      await fs.writeFile(itemPath, item.zipBuffer)
      item.zipBuffer = 'OMITTED'
    } else if (item.type === 'FileFsRef') {
      const writeStream = fs.createWriteStream(itemPath)
      item.toStream().pipe(writeStream)
    }
  }

  await fs.writeFile(
    path.join(outputDir, 'output.json'),
    JSON.stringify(buildOutput, null, 2),
  )
}
