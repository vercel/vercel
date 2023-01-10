import frameworkList from '@vercel/frameworks';
import { detectFramework } from '../src';
import { FixtureFilesystem } from './utils/fixture-filesystem';
import { readdirSync, lstatSync } from 'fs';
import { join } from 'path';

function getExamples() {
  const root = join(__dirname, '..', '..', '..');
  const examplesPath = join(root, 'examples');
  const examples = readdirSync(examplesPath);

  const exampleDirs = examples.filter(example => {
    const examplePath = join(examplesPath, example);
    const stat = lstatSync(examplePath);
    return stat.isDirectory();
  });

  return exampleDirs.map(exampleDirName => {
    return [exampleDirName, join(examplesPath, exampleDirName)];
  });
}

describe('examples should be detected', () => {
  const examples = getExamples();

  it.each(examples)('%s', async (example, examplePath) => {
    const fs = new FixtureFilesystem(examplePath);
    const framework = await detectFramework({ fs, frameworkList });
    if (!framework) {
      throw new Error(`Framework not detected for example "${example}".`);
    }

    expect(framework).toBe(example);
  });
});
