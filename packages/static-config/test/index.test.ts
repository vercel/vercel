import { join } from 'path';
import { Project } from 'ts-morph';
import { getConfig } from '../src';

describe('getConfig()', () => {
  it('should parse config from Node.js file', () => {
    const project = new Project();
    const sourcePath = join(__dirname, 'fixtures/node.js');
    const config = getConfig(project, sourcePath);
    expect(config).toMatchInlineSnapshot(`
      {
        "maxDuration": 60,
        "memory": 1024,
        "regions": [
          "fra1",
        ],
        "runtime": "nodejs",
      }
    `);
  });

  it('should parse config from Deno file', () => {
    const project = new Project();
    const sourcePath = join(__dirname, 'fixtures/deno.ts');
    const config = getConfig(project, sourcePath, {
      type: 'object',
      properties: {
        location: { type: 'string' },
      },
    } as const);
    expect(config).toMatchInlineSnapshot(`
      {
        "location": "https://example.com/page",
        "maxDuration": 60,
        "runtime": "deno",
      }
    `);
  });

  it('should return `null` when no config was exported', () => {
    const project = new Project();
    const sourcePath = join(__dirname, 'fixtures/no-config.js');
    const config = getConfig(project, sourcePath);
    expect(config).toBeNull();
  });

  it('should throw an error upon schema validation failure', () => {
    const project = new Project();
    const sourcePath = join(__dirname, 'fixtures/invalid-schema.js');
    let err: Error | undefined;
    try {
      getConfig(project, sourcePath);
    } catch (_err) {
      err = _err as unknown as Error;
    }
    expect(err?.message).toEqual('Invalid data');
  });
});
