# @vercel/rex

Rex compiler and parser package.

## Install

```sh
bun add -g @vercel/rex
```

## Publish to npm

From `packages/rex-lang`:

```sh
npm whoami
bun run prepublishOnly
npm publish --access public
```

Or one-off dry run:

```sh
bun run pack:dry-run
```

## CLI

```sh
rex --help
rex --expr "when x do y end"
rex --file input.rex
cat input.rex | rex
rex --expr "a and b" --ir
rex --expr "x = method + path x" --minify-names --dedupe-values
```

Run without installing globally:

```sh
bunx @vercel/rex --help
bunx @vercel/rex --expr "when x do y end"

npx -y @vercel/rex -- --help
npx -y @vercel/rex -- --expr "when x do y end"
```

`npx` works with Node.js alone (v22.18+). `bunx` works with Bun alone.

## Data Tool (`rx`)

The `rx` CLI for inspecting, converting, and filtering REXC/JSON data lives in [`packages/rx-format`](../rx-format/) (published as `@creationix/rx`). See its [README](../rx-format/README.md) for full usage.

## Programmatic API

```ts
import { compile, parseToIR, optimizeIR, encodeIR } from '@vercel/rex';

const source = 'when x do y else z end';
const encoded = compile(source);
const optimized = compile(source, {
  optimize: true,
  minifyNames: true,
  dedupeValues: true,
});

const ir = parseToIR(source);
const optimizedIR = optimizeIR(ir);
const reEncoded = encodeIR(optimizedIR);
```
