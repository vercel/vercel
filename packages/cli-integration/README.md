# CLI Integration Tests

Black-box integration tests for the Vercel CLI using [Scrut](https://github.com/facebookincubator/scrut).

## Prerequisites

Install scrut (one-time):

```bash
cargo install scrut
# Or: curl --proto '=https' --tlsv1.2 -sSf https://facebookincubator.github.io/scrut/install.sh | sh
```

## Running Tests

```bash
# From monorepo root - build CLI first, then run tests
pnpm --filter vercel build
pnpm --filter @vercel/cli-integration test

# Or from this package directory (after CLI is built)
pnpm test

# Run a specific test file
scrut test --cram-compat -w ../cli commands/version.md

# Update expected output after intentional CLI changes
scrut update --cram-compat -w ../cli commands/
```

## Writing Tests

Tests are Markdown files with `scrut` code blocks:

````markdown
## Test Name

```scrut
$ node ./dist/vc.js --version
Vercel CLI \d+\.\d+\.\d+ (re)
```
````

### Pattern Matching

- `(re)` - Regex: `Version \d+\.\d+\.\d+ (re)`
- `(glob)` - Glob: `*.txt (glob)`
- Exact match is tried first

### Exit Codes

```markdown
$ node ./dist/vc.js bad-command
[1]
```

## Directory Structure

```text
packages/cli-integration/
├── package.json
├── README.md
└── commands/
    ├── version.md    # --version tests
    ├── help.md       # --help tests
    └── errors.md     # Error handling tests
```
