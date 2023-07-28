import { join } from 'path';
import { writeFile, rm } from 'fs/promises';
import { readConfigFile } from '../src';

describe('Test `readConfigFile()`', () => {
  let logMessages: string[];
  const originalConsoleLog = console.log;

  beforeEach(() => {
    logMessages = [];
    console.log = m => {
      logMessages.push(m);
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  const doesnotexist = join(__dirname, 'does-not-exist.json');
  const tsconfig = join(__dirname, '../tsconfig.json');
  const invalid = join(__dirname, 'invalid.json');

  it('should return null when file does not exist', async () => {
    expect(await readConfigFile(doesnotexist)).toBeNull();
    expect(logMessages).toEqual([]);
  });

  it('should return parsed object when file exists', async () => {
    expect(await readConfigFile(tsconfig)).toMatchObject({
      compilerOptions: {
        strict: true,
      },
    });
    expect(logMessages).toEqual([]);
  });

  it('should return parsed object when at least one file exists', async () => {
    const files = [doesnotexist, tsconfig];
    expect(await readConfigFile(files)).toMatchObject({
      compilerOptions: {
        strict: true,
      },
    });
    expect(logMessages).toEqual([]);
  });

  it('should return null when parse fails', async () => {
    try {
      await writeFile(invalid, 'borked');
      expect(await readConfigFile(invalid)).toBeNull();
    } finally {
      await rm(invalid);
    }
    expect(logMessages.length).toBe(1);
    expect(logMessages[0]).toMatch(
      /^Error while parsing config file.+invalid.json/
    );
  });

  it('should return parsed object when at least one file is valid', async () => {
    try {
      await writeFile(invalid, 'borked');
      expect(await readConfigFile([invalid, tsconfig])).toMatchObject({
        compilerOptions: {
          strict: true,
        },
      });
    } finally {
      await rm(invalid);
    }
    expect(logMessages.length).toBe(1);
    expect(logMessages[0]).toMatch(
      /^Error while parsing config file.+invalid.json/
    );
  });
});
