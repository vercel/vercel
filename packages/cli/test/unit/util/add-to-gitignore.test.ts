import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp-promise';
import { describe, expect, beforeEach, it, afterAll, beforeAll } from 'vitest';
import { addToGitIgnore } from '../../../src/util/add-to-gitignore';

const tmpDir = tmp.tmpNameSync({
  prefix: 'test-vercel-cli-add-to-git-ignore',
});

describe('addToGitIgnore', () => {
  const gitignoreFilePath = path.join(tmpDir, '.gitignore');
  const readGitIgnore = () => fs.readFileSync(gitignoreFilePath).toString();
  const createGitIgnore = (rules: string = '') =>
    fs.writeFileSync(gitignoreFilePath, rules);

  beforeAll(() => {
    fs.mkdirs(tmpDir);
  });
  afterAll(() => {
    fs.rmSync(gitignoreFilePath);
  });

  describe('when .gitignore is empty', () => {
    beforeEach(() => {
      createGitIgnore();
    });

    it('should add only once', async () => {
      const newRule = '.env*local';
      const modified = await addToGitIgnore(tmpDir, newRule);
      const file = readGitIgnore();

      expect(modified).toBe(true);
      expect(file).contains(newRule);
    });

    it('should not add twice', async () => {
      const newRule = '.env*local';
      const modifiedFirstRun = await addToGitIgnore(tmpDir, newRule);
      const modifiedSecondRun = await addToGitIgnore(tmpDir, newRule);
      const file = readGitIgnore();

      expect(file).contains(newRule);
      expect(modifiedFirstRun).toBe(true);
      expect(modifiedSecondRun).toEqual(false);
    });
  });
});
