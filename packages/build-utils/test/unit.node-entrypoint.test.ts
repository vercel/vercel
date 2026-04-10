import { describe, expect, it } from 'vitest';
import { join } from 'path';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { isNodeEntrypoint } from '../src/node-entrypoint';

async function createTempFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'node-entrypoint-'));
  const fsPath = join(dir, 'test.ts');
  await writeFile(fsPath, content, 'utf-8');
  return fsPath;
}

async function check(content: string): Promise<boolean> {
  const fsPath = await createTempFile(content);
  try {
    return await isNodeEntrypoint({ fsPath });
  } finally {
    await rm(fsPath, { force: true });
  }
}

describe('isNodeEntrypoint()', () => {
  describe('returns true for valid entrypoints', () => {
    it('ESM default function export', async () => {
      expect(
        await check(
          'export default function handler(req, res) { res.end("ok"); }'
        )
      ).toBe(true);
    });

    it('ESM default arrow export', async () => {
      expect(
        await check('export default (req, res) => { res.end("ok"); }')
      ).toBe(true);
    });

    it('ESM default class export', async () => {
      expect(await check('export default class Handler {}')).toBe(true);
    });

    it('CJS module.exports assignment', async () => {
      expect(
        await check('module.exports = (req, res) => { res.end("ok"); }')
      ).toBe(true);
    });

    it('CJS module.exports with require', async () => {
      expect(
        await check(
          'const handler = require("./handler");\nmodule.exports = handler;'
        )
      ).toBe(true);
    });

    it('ESM named GET export', async () => {
      expect(
        await check(
          'export function GET(request) { return new Response("ok"); }'
        )
      ).toBe(true);
    });

    it('ESM named async POST export', async () => {
      expect(
        await check(
          'export async function POST(request) { return new Response("ok"); }'
        )
      ).toBe(true);
    });

    it('ESM const GET export', async () => {
      expect(
        await check('export const GET = async (req) => new Response("ok");')
      ).toBe(true);
    });

    it('ESM fetch export', async () => {
      expect(
        await check(
          'export function fetch(request) { return new Response("ok"); }'
        )
      ).toBe(true);
    });

    it('ESM re-export with default', async () => {
      expect(
        await check('export { handler as default } from "./handler";')
      ).toBe(true);
    });

    it('ESM re-export GET', async () => {
      expect(await check('export { GET } from "./handlers";')).toBe(true);
    });

    it('ESM re-export multiple methods', async () => {
      expect(await check('export { GET, POST } from "./handlers";')).toBe(true);
    });

    it('CJS exports.GET', async () => {
      expect(
        await check('exports.GET = function(req, res) { res.end("ok"); }')
      ).toBe(true);
    });

    it('CJS module.exports.default', async () => {
      expect(
        await check(
          'module.exports.default = function(req, res) { res.end("ok"); }'
        )
      ).toBe(true);
    });

    it('CJS exports.fetch', async () => {
      expect(
        await check('exports.fetch = async (req) => new Response("ok");')
      ).toBe(true);
    });

    it('TypeScript handler with type annotations', async () => {
      expect(
        await check(
          'import type { Request, Response } from "express";\nexport default function handler(req: Request, res: Response) { res.end("ok"); }'
        )
      ).toBe(true);
    });

    it('TypeScript GET with return type', async () => {
      expect(
        await check(
          'export async function GET(request: Request): Promise<Response> { return new Response("ok"); }'
        )
      ).toBe(true);
    });

    it('export default after imports and type declarations', async () => {
      expect(
        await check(
          'import { db } from "./db";\ntype Config = { key: string };\nconst config: Config = { key: "val" };\nexport default async function handler(req, res) { res.end("ok"); }'
        )
      ).toBe(true);
    });

    it('http.createServer without exports', async () => {
      expect(
        await check(
          'const http = require("http");\nhttp.createServer((req, res) => { res.end("ok"); }).listen(3000);'
        )
      ).toBe(true);
    });

    it('http.createServer with variable', async () => {
      expect(
        await check(
          'import http from "http";\nconst server = http.createServer(handler);\nserver.listen(3000);'
        )
      ).toBe(true);
    });

    it('all HTTP methods', async () => {
      for (const method of [
        'GET',
        'HEAD',
        'OPTIONS',
        'POST',
        'PUT',
        'DELETE',
        'PATCH',
      ]) {
        expect(
          await check(
            `export function ${method}(request) { return new Response("ok"); }`
          )
        ).toBe(true);
      }
    });
  });

  describe('returns false for non-entrypoints', () => {
    it('empty file', async () => {
      expect(await check('')).toBe(false);
    });

    it('whitespace-only file', async () => {
      expect(await check('   \n\n  ')).toBe(false);
    });

    it('utility functions only', async () => {
      expect(
        await check(
          'export function helper() { return "hi"; }\nexport function formatDate(d) { return d.toISOString(); }'
        )
      ).toBe(false);
    });

    it('config-only export', async () => {
      expect(await check('export const config = { runtime: "edge" };')).toBe(
        false
      );
    });

    it('TypeScript types-only file', async () => {
      expect(
        await check(
          'export interface ApiResponse { status: number; data: unknown; }\nexport type Handler = (req: Request) => Response;'
        )
      ).toBe(false);
    });

    it('commented-out default export', async () => {
      expect(
        await check(
          '// export default function handler(req, res) { res.end("ok"); }\nexport function helper() { return "hi"; }'
        )
      ).toBe(false);
    });

    it('commented-out module.exports', async () => {
      expect(
        await check(
          '// module.exports = handler\nexport function helper() { return "hi"; }'
        )
      ).toBe(false);
    });

    it('commented-out http.createServer', async () => {
      expect(
        await check(
          '// http.createServer((req, res) => { res.end("ok"); }).listen(3000);\nexport function helper() { return "hi"; }'
        )
      ).toBe(false);
    });

    it('block-commented default export', async () => {
      expect(
        await check(
          '/* export default function handler(req, res) { res.end("ok"); } */\nexport function helper() { return "hi"; }'
        )
      ).toBe(false);
    });

    it('named non-handler exports only', async () => {
      expect(
        await check(
          'export const DB_URL = "postgres://localhost";\nexport function connect() { return null; }'
        )
      ).toBe(false);
    });

    it('import-only file', async () => {
      expect(
        await check(
          'import { db } from "./db";\nconst result = db.query("SELECT 1");'
        )
      ).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns true when file cannot be read', async () => {
      expect(await isNodeEntrypoint({ fsPath: '/nonexistent/file.ts' })).toBe(
        true
      );
    });

    it('returns true when fsPath is undefined', async () => {
      expect(await isNodeEntrypoint({})).toBe(true);
    });
  });
});
