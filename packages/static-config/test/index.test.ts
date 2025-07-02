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
    let err;
    try {
      getConfig(project, sourcePath);
    } catch (_err) {
      err = _err;
    }
    expect(err.message).toEqual('Invalid data');
  });

  it('should parse config with experimental triggers', () => {
    const project = new Project();
    const sourcePath = join(__dirname, 'fixtures/experimental-triggers.js');
    const config = getConfig(project, sourcePath);
    expect(config).toMatchInlineSnapshot(`
      {
        "experimentalTriggers": [
          {
            "httpBinding": {
              "method": "POST",
              "mode": "structured",
              "pathname": "/webhooks/test",
            },
            "specversion": "1.0",
            "triggerVersion": 1,
            "type": "v1.test.vercel.com",
          },
          {
            "httpBinding": {
              "method": "POST",
              "mode": "structured",
            },
            "queue": {
              "consumer": "webhook-processor",
              "initialDelaySeconds": 0,
              "maxAttempts": 3,
              "retryAfterSeconds": 10,
              "topic": "user-events",
            },
            "specversion": "1.0",
            "triggerVersion": 1,
            "type": "com.vercel.queue.v1",
          },
        ],
        "runtime": "nodejs18.x",
      }
    `);
  });

  it('should throw error for invalid trigger schema', () => {
    const project = new Project();
    const sourcePath = join(__dirname, 'fixtures/invalid-trigger-schema.js');
    let err;
    try {
      getConfig(project, sourcePath);
    } catch (_err) {
      err = _err;
    }
    expect(err.message).toEqual('Invalid data');
  });
});
