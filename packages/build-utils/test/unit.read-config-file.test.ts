import { join } from 'path';
import { writeFile, rm } from 'fs/promises';
import { readConfigFile } from '../src';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  const multiDocumentYaml = join(__dirname, 'multi-document.yaml');

  it('should return null when file does not exist', async () => {
    expect(await readConfigFile(doesnotexist)).toBeNull();
    expect(logMessages).toEqual([]);
  });

  it('should return parsed object when file exists', async () => {
    expect(await readConfigFile(tsconfig)).toMatchObject({
      compilerOptions: {
        outDir: './dist',
      },
    });
    expect(logMessages).toEqual([]);
  });

  it('should return parsed object when at least one file exists', async () => {
    const files = [doesnotexist, tsconfig];
    expect(await readConfigFile(files)).toMatchObject({
      compilerOptions: {
        outDir: './dist',
      },
    });
    expect(logMessages).toEqual([]);
  });

  it('should return the final document from multi-document YAML', async () => {
    try {
      await writeFile(
        multiDocumentYaml,
        `---
lockfileVersion: '9.0'
source: config-dependency
---
lockfileVersion: '9.0'
source: workspace
`
      );
      expect(await readConfigFile(multiDocumentYaml)).toEqual({
        lockfileVersion: '9.0',
        source: 'workspace',
      });
    } finally {
      await rm(multiDocumentYaml);
    }
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
          outDir: './dist',
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
