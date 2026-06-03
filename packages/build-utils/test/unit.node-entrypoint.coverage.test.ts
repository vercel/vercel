import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { isNodeEntrypoint } from '../src/node-entrypoint';

let dir: string;
let file: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ne-fuzz-'));
  file = join(dir, 't.ts');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function isEntry(content: string): Promise<boolean> {
  writeFileSync(file, content, 'utf-8');
  return isNodeEntrypoint({ fsPath: file });
}

// Every shape @vercel/node can resolve at runtime — none may be dropped.
const VALID: [string, string][] = [
  ['esm default fn', 'export default function h(req,res){ res.end("ok"); }'],
  ['esm default arrow', 'export default (req,res)=>{ res.end("ok"); }'],
  ['esm default class', 'export default class H {}'],
  ['esm default identifier', 'const h=(q,s)=>{};\nexport default h;'],
  ['named GET', 'export function GET(r){ return new Response(); }'],
  [
    'named async POST',
    'export async function POST(r){ return new Response(); }',
  ],
  ['const GET arrow', 'export const GET = async (r)=>new Response();'],
  ['fetch', 'export function fetch(r){ return new Response(); }'],
  ['re-export {GET}', 'export { GET } from "./h";'],
  ['re-export {foo as GET}', 'export { foo as GET } from "./h";'],
  ['re-export {x as default}', 'export { x as default } from "./h";'],
  ['re-export {default}', 'export { default } from "./h";'],
  ['local export {GET}', 'const GET=()=>new Response();\nexport { GET };'],
  [
    'cjs module.exports = fn',
    'module.exports = (req,res)=>{ res.end("ok"); };',
  ],
  ['cjs module.exports = require', 'module.exports = require("./h");'],
  ['cjs module.exports = {GET,POST}', 'module.exports = { GET, POST };'],
  ['cjs exports.GET', 'exports.GET = function(q,s){ s.end(); };'],
  [
    'cjs module.exports.default',
    'module.exports.default = function(q,s){ s.end(); };',
  ],
  ['cjs exports.fetch', 'exports.fetch = async (r)=>new Response();'],
  ['cjs exports["GET"] bracket', 'exports["GET"] = (q,s)=>{};'],
  [
    'cjs defineProperty',
    'Object.defineProperty(exports, "GET", { value: ()=>{} });',
  ],
  ['ts export = fn', 'import h from "./h";\nexport = h;'],
  ['ts export = arrow', 'export = (req,res)=>{ res.end("ok"); };'],
  ['export * from', 'export * from "./handlers";'],
  [
    'http.createServer().listen()',
    'const http=require("http");\nhttp.createServer((q,s)=>{}).listen(3000);',
  ],
  [
    'express app.listen()',
    'const app=express();\napp.get("/",(q,s)=>{});\napp.listen(3000);',
  ],
  [
    'ts default w/ annotations',
    'export default function h(req: Req, res: Res){ res.end(); }',
  ],
  [
    'ts GET return type',
    'export async function GET(r: Request): Promise<Response> { return new Response(); }',
  ],
  ['ts generic default', 'export default function h<T>(req: T){ return req; }'],
  [
    'ts satisfies default',
    'export default (async (r)=>new Response()) satisfies H;',
  ],
  ['decorator default class', '@C()\nexport default class X { @G() get(){} }'],
  [
    'shebang + default',
    '#!/usr/bin/env node\nexport default function h(q,s){ s.end(); }',
  ],
  [
    'all HTTP methods',
    ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE', 'PATCH']
      .map(m => `export function ${m}(r){ return new Response(); }`)
      .join('\n'),
  ],
  [
    'the original bug repro',
    "module.exports.config = { maxDuration: 60 };\nconst ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';\nexport async function GET() {\n  return new Response('Hello from IG!', { headers: { 'Accept': ACCEPT } }); /* done */\n}",
  ],
];

// Genuine non-entrypoints — should be filtered out.
const INVALID: [string, string][] = [
  ['empty', ''],
  ['whitespace', '   \n\n  '],
  [
    'utility funcs',
    'export function helper(){}\nexport function formatDate(d){ return d; }',
  ],
  ['config-only', 'export const config = { runtime: "edge" };'],
  [
    'ts types-only',
    'export interface A { x: number }\nexport type H = ()=>void;',
  ],
  ['non-handler const', 'export const DB_URL = "postgres://localhost";'],
  [
    'import-only',
    'import { db } from "./db";\nconst r = db.query("SELECT 1");',
  ],
  [
    'export * as ns (namespace, not handler)',
    'export * as api from "./handlers";',
  ],
  [
    'commented-out default',
    '// export default function h(q,s){}\nexport function helper(){}',
  ],
  [
    'commented-out module.exports',
    '// module.exports = h\nexport function helper(){}',
  ],
  [
    'block-commented handler',
    '/* export default function h(q,s){} */\nexport function helper(){}',
  ],
  [
    'handler text only in a string',
    'export function docs(){ return "module.exports = x or app.listen(3000)"; }',
  ],
];

describe('catalog: valid handler shapes are never dropped', () => {
  for (const [name, src] of VALID) {
    it(name, async () => expect(await isEntry(src)).toBe(true));
  }
});

describe('catalog: genuine non-entrypoints are filtered', () => {
  for (const [name, src] of INVALID) {
    it(name, async () => expect(await isEntry(src)).toBe(false));
  }
});

// Deterministic PRNG so the fuzz is reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('property fuzz: surrounding noise never drops a real handler', () => {
  it('handlers survive adversarial comment/literal noise', async () => {
    const bases = [
      'export default function handler(req,res){ res.end("ok"); }',
      'export function GET(){ return new Response(); }',
      'module.exports = (req,res)=>{ res.end("ok"); };',
      'export = (req,res)=>{ res.end("ok"); };',
      'export * from "./h";',
      'const http=require("http"); http.createServer((q,s)=>{}).listen(3000);',
    ];
    // Each line is comment-like / literal noise that previously risked eating code.
    const noise = [
      "const a = '*/*';",
      'const b = "text/html,*/*;q=0.8";',
      '/* a multi\nline\nblock comment */',
      '// a line comment with a url http://example.com/a/b',
      'const c = `template */ with /* slashes`;',
      'const d = "continued \\\nacross a line";',
      'const e = "decoy: module.exports = fake and .listen(1)";',
      '/* export default function fake(q,s){} */',
      "const f = 'a//b /*c*/ d';",
      'const g = `tmpl with // and /* */ inside`;',
    ];
    const rand = mulberry32(0xc0ffee);
    const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
    const lines = (n: number) =>
      Array.from({ length: Math.floor(rand() * n) }, () => pick(noise)).join(
        '\n'
      );

    const failures: string[] = [];
    for (let i = 0; i < 4000; i++) {
      const src = `${lines(4)}\n${pick(bases)}\n${lines(4)}`;
      if (!(await isEntry(src))) failures.push(src);
    }
    expect(failures).toEqual([]);
  });
});
