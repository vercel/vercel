import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'path';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { isNodeEntrypoint } from '../src/node-entrypoint';

// One temp file, reused across cases (tests in a file run sequentially), so the
// large property-fuzz below doesn't create thousands of throwaway files.
let workDir: string;
let entryFile: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'node-entrypoint-'));
  entryFile = join(workDir, 'entry.ts');
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function check(content: string): Promise<boolean> {
  await writeFile(entryFile, content, 'utf-8');
  return isNodeEntrypoint({ fsPath: entryFile });
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

    it('Express app that calls .listen()', async () => {
      expect(
        await check(
          'const express = require("express");\nconst app = express();\napp.get("/", (req, res) => res.end("ok"));\napp.listen(3000);'
        )
      ).toBe(true);
    });

    it('TSX default export whose body returns JSX', async () => {
      expect(
        await check(
          'export default function Page() { return <div className="x">hi</div>; }'
        )
      ).toBe(true);
    });

    it('ESM default export of an identifier', async () => {
      expect(await check('const h = (q, s) => {};\nexport default h;')).toBe(
        true
      );
    });

    it('local named export list', async () => {
      expect(
        await check('const GET = () => new Response();\nexport { GET };')
      ).toBe(true);
    });

    it('CJS module.exports object of handlers', async () => {
      expect(await check('module.exports = { GET, POST };')).toBe(true);
    });

    it('CJS export via a string key', async () => {
      expect(await check('exports["GET"] = (q, s) => {};')).toBe(true);
    });

    it('CJS export via Object.defineProperty', async () => {
      expect(
        await check(
          'Object.defineProperty(exports, "GET", { value: () => {} });'
        )
      ).toBe(true);
    });

    it('TypeScript export-assignment (export =)', async () => {
      expect(await check('import h from "./h";\nexport = h;')).toBe(true);
    });

    it('star re-export (export * from)', async () => {
      expect(await check('export * from "./handlers";')).toBe(true);
    });

    it('TypeScript generic default export', async () => {
      expect(
        await check('export default function h<T>(req: T) { return req; }')
      ).toBe(true);
    });

    it('TypeScript default export with satisfies', async () => {
      expect(
        await check('export default (async (r) => new Response()) satisfies H;')
      ).toBe(true);
    });

    it('decorated default class export', async () => {
      expect(
        await check('@Controller()\nexport default class X { @Get() get() {} }')
      ).toBe(true);
    });

    it('handler after a shebang line', async () => {
      expect(
        await check(
          '#!/usr/bin/env node\nexport default function h(q, s) { s.end(); }'
        )
      ).toBe(true);
    });
  });

  // Regression: entrypoint detection must not treat comment-like sequences
  // (`/*`, `//`, `*/`) that appear inside string, template, or regex literals
  // as real comments. For example, the `*/*` in an `Accept` header contains a
  // `/*` that, if read as a block-comment start, deletes everything up to the
  // next `*/` and swallows the handler export — dropping the function from the
  // build entirely.
  describe('is not fooled by comment-like sequences in literals', () => {
    it('Accept header */* before a later block comment', async () => {
      expect(
        await check(
          [
            'const ACCEPT =',
            "  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';",
            '',
            'export async function GET() {',
            "  return new Response('Hello from IG!', {",
            "    headers: { 'Accept': ACCEPT },",
            '  }); /* done */',
            '}',
          ].join('\n')
        )
      ).toBe(true);
    });

    it('module.exports handler with */* string and trailing block comment', async () => {
      expect(
        await check(
          [
            "const accept = '*/*';",
            'module.exports = async (req, res) => {',
            '  res.end(accept);',
            '};',
            '/* helper notes below */',
          ].join('\n')
        )
      ).toBe(true);
    });

    it('export default with /* inside a string literal', async () => {
      expect(
        await check(
          [
            "const pattern = '/* not a comment */';",
            'export default function handler(req, res) { res.end(pattern); }',
          ].join('\n')
        )
      ).toBe(true);
    });

    it('export alongside a */* sequence in a template literal', async () => {
      expect(
        await check(
          [
            'const msg = `value with */* sequence`;',
            'export function POST(request) { return new Response(msg); }',
          ].join('\n')
        )
      ).toBe(true);
    });

    it('export alongside a regex literal containing */', async () => {
      expect(
        await check(
          [
            'const re = /foo\\/*bar/;',
            'export function GET(request) { return new Response(String(re)); }',
          ].join('\n')
        )
      ).toBe(true);
    });

    it('still strips a genuine block comment wrapping an export', async () => {
      expect(
        await check(
          [
            "const accept = '*/*';",
            '/* export default function handler(req, res) { res.end(accept); } */',
            'export function helper() { return accept; }',
          ].join('\n')
        )
      ).toBe(false);
    });

    it('handler-like text inside a string literal is not a false positive', async () => {
      expect(
        await check(
          [
            'export function docs() {',
            '  return "set module.exports = handler or call app.listen(3000)";',
            '}',
          ].join('\n')
        )
      ).toBe(false);
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

    it('star namespace re-export is not a handler', async () => {
      // `export * as ns` exports a namespace object, not GET/default/fetch, so
      // it must not be matched by the `export * from` entrypoint pattern.
      expect(await check('export * as api from "./handlers";')).toBe(false);
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

  describe('property: a real handler survives any surrounding noise', () => {
    // Deterministic PRNG so the fuzz is reproducible across runs.
    function mulberry32(seed: number) {
      return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    it('is never dropped when wrapped in adversarial comment/literal noise', async () => {
      const bases = [
        'export default function handler(req, res) { res.end("ok"); }',
        'export function GET() { return new Response(); }',
        'module.exports = (req, res) => { res.end("ok"); };',
        'export = (req, res) => { res.end("ok"); };',
        'export * from "./h";',
        'const http = require("http"); http.createServer((q, s) => {}).listen(3000);',
      ];
      // Comment-like / literal noise that has historically risked eating code.
      const noise = [
        "const a = '*/*';",
        'const b = "text/html,*/*;q=0.8";',
        '/* a multi\nline\nblock comment */',
        '// a line comment with a url http://example.com/a/b',
        'const c = `template */ with /* slashes`;',
        'const d = "continued \\\nacross a line";',
        'const e = "decoy: module.exports = fake and .listen(1)";',
        '/* export default function fake(q, s) {} */',
        "const f = 'a//b /*c*/ d';",
        'const g = `tmpl with // and /* */ inside`;',
      ];
      const rand = mulberry32(0xc0ffee);
      const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
      const lines = (n: number) =>
        Array.from({ length: Math.floor(rand() * n) }, () => pick(noise)).join(
          '\n'
        );

      const dropped: string[] = [];
      for (let i = 0; i < 4000; i++) {
        const src = `${lines(4)}\n${pick(bases)}\n${lines(4)}`;
        if (!(await check(src))) dropped.push(src);
      }
      expect(dropped).toEqual([]);
    });
  });
});
